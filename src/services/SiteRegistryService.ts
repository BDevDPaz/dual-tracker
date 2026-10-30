import { Site } from "../core/contracts";
import { persistenceService } from "./PersistenceService";
import { getDistanceFromLatLonInMeters } from "../utils/geoUtils";

/**
 * ============================================================================
 * SiteRegistryService — Propuesta 5.5 (nuevo)
 * ----------------------------------------------------------------------------
 * Catálogo de destinos/clientes. Evita que cada jornada sea solo un string de
 * dirección tecleado el mismo día: la jornada referencia `siteId`, no un texto
 * libre como única fuente de verdad.
 *
 * Este servicio NO decide el límite de destinos por sí mismo — el valor de
 * `destinationLimit` vive en la política de Settings (otra ola de trabajo).
 * `enforceDestinationLimit` es un helper puro que el llamador (SettingsService
 * / capa de UI) usa para validar antes de invocar `createSite`.
 * ============================================================================
 */

/** Entrada de creación de un sitio: todo excepto id/isActive/createdAtMs. */
export interface CreateSiteInput {
  alias: string;
  clientId: string | null;
  clientName: string | null;
  address: string;
  targetLatitude: number;
  targetLongitude: number;
  radiusMeters: number;
}

/** Error tipado cuando la entrada de creación de sitio no es válida. */
export class SiteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteValidationError";
  }
}

function isValidLatitude(lat: number): boolean {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lon: number): boolean {
  return typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function generateSiteId(): string {
  return `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class SiteRegistryService {
  /**
   * Valida y persiste un nuevo sitio del catálogo.
   * Lanza `SiteValidationError` si alias/lat/lon/radius no cumplen las reglas
   * mínimas de la Propuesta 5.5.
   */
  async createSite(input: CreateSiteInput): Promise<Site> {
    if (!input.alias || input.alias.trim().length === 0) {
      throw new SiteValidationError("El alias del sitio es obligatorio.");
    }
    if (!isValidLatitude(input.targetLatitude)) {
      throw new SiteValidationError(
        `targetLatitude fuera de rango (-90..90): ${input.targetLatitude}`,
      );
    }
    if (!isValidLongitude(input.targetLongitude)) {
      throw new SiteValidationError(
        `targetLongitude fuera de rango (-180..180): ${input.targetLongitude}`,
      );
    }
    if (!(input.radiusMeters > 0)) {
      throw new SiteValidationError(`radiusMeters debe ser mayor que 0: ${input.radiusMeters}`);
    }

    const site: Site = {
      id: generateSiteId(),
      alias: input.alias.trim(),
      clientId: input.clientId,
      clientName: input.clientName,
      address: input.address,
      targetLatitude: input.targetLatitude,
      targetLongitude: input.targetLongitude,
      radiusMeters: input.radiusMeters,
      isActive: true,
      createdAtMs: Date.now(),
    };

    await persistenceService.upsertSite(site);
    return site;
  }

  /** Lista los sitios del catálogo; `activeOnly` filtra por `isActive`. */
  async listSites(activeOnly?: boolean): Promise<Site[]> {
    const sites = await persistenceService.listSites();
    if (!activeOnly) return sites;
    return sites.filter((site) => site.isActive);
  }

  /**
   * Encuentra el sitio activo más cercano a una coordenada dada.
   * Retorna `null` si el catálogo no tiene sitios activos.
   */
  async findNearest(
    lat: number,
    lon: number,
  ): Promise<{ site: Site; distanceMeters: number } | null> {
    const sites = await this.listSites(true);
    if (sites.length === 0) return null;

    let best: { site: Site; distanceMeters: number } | null = null;
    for (const site of sites) {
      const distanceMeters = getDistanceFromLatLonInMeters(
        lat,
        lon,
        site.targetLatitude,
        site.targetLongitude,
      );
      if (best === null || distanceMeters < best.distanceMeters) {
        best = { site, distanceMeters };
      }
    }
    return best;
  }

  /**
   * Refleja la política de Settings `destinationLimit`: true si aún se puede
   * crear un sitio nuevo (currentCount < limit). Helper puro, sin I/O.
   */
  enforceDestinationLimit(currentCount: number, limit: number): boolean {
    if (!Number.isFinite(limit) || limit < 0) return true;
    return currentCount < limit;
  }

  /**
   * Obtiene un sitio por id, o null si no existe en el catálogo.
   * Usado por la capa app/ (sites/[id].tsx) para la ficha de un destino.
   */
  async getSite(id: string): Promise<Site | null> {
    const sites = await persistenceService.listSites();
    return sites.find((site) => site.id === id) ?? null;
  }

  /**
   * Archivar NO borra historial: solo pone `isActive: false`, para que el
   * sitio deje de aparecer como destino disponible en DailySetupModal pero
   * sus sesiones/visitas pasadas sigan siendo consultables por siteId
   * (Propuesta capa app §5.11: "Archivar no borra historial").
   */
  async archiveSite(id: string): Promise<Site> {
    const existing = await this.getSite(id);
    if (!existing) {
      throw new SiteValidationError(`Sitio ${id} no existe en el catálogo.`);
    }
    const archived: Site = { ...existing, isActive: false };
    await persistenceService.upsertSite(archived);
    return archived;
  }

  /** Reactiva un sitio previamente archivado. */
  async reactivateSite(id: string): Promise<Site> {
    const existing = await this.getSite(id);
    if (!existing) {
      throw new SiteValidationError(`Sitio ${id} no existe en el catálogo.`);
    }
    const reactivated: Site = { ...existing, isActive: true };
    await persistenceService.upsertSite(reactivated);
    return reactivated;
  }

  /**
   * Edita un sitio existente conservando su id (a diferencia de
   * `createSite`, que siempre genera uno nuevo). Usado por la ficha de sitio
   * (app/sites/[id].tsx) para corregir alias, radio o coordenadas sin perder
   * el historial de visitas que referencia ese `siteId`.
   */
  async updateSite(id: string, patch: Partial<CreateSiteInput>): Promise<Site> {
    const existing = await this.getSite(id);
    if (!existing) {
      throw new SiteValidationError(`Sitio ${id} no existe en el catálogo.`);
    }

    const next: Site = {
      ...existing,
      alias: patch.alias?.trim() || existing.alias,
      clientId: patch.clientId ?? existing.clientId,
      clientName: patch.clientName ?? existing.clientName,
      address: patch.address ?? existing.address,
      targetLatitude: patch.targetLatitude ?? existing.targetLatitude,
      targetLongitude: patch.targetLongitude ?? existing.targetLongitude,
      radiusMeters: patch.radiusMeters ?? existing.radiusMeters,
    };

    if (!isValidLatitude(next.targetLatitude)) {
      throw new SiteValidationError(
        `targetLatitude fuera de rango (-90..90): ${next.targetLatitude}`,
      );
    }
    if (!isValidLongitude(next.targetLongitude)) {
      throw new SiteValidationError(
        `targetLongitude fuera de rango (-180..180): ${next.targetLongitude}`,
      );
    }
    if (!(next.radiusMeters > 0)) {
      throw new SiteValidationError(`radiusMeters debe ser mayor que 0: ${next.radiusMeters}`);
    }

    await persistenceService.upsertSite(next);
    return next;
  }
}

export const siteRegistryService = new SiteRegistryService();
