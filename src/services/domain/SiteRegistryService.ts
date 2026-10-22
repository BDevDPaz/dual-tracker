/**
 * SiteRegistryService — Dominio (Propuesta Técnica §5.5, nuevo)
 * ============================================================================
 * Catálogo de destinos y clientes. Evita que cada jornada sea solo un string
 * de dirección tecleado el mismo día (como en DailySetupModal de GEOTrack).
 *  - Sitio con alias, cliente, coordenadas objetivo, radio propio y estado activo.
 *  - Geocodificación al crear el sitio (el geocoder real lo inyecta el runtime:
 *    GeofenceRuntimeService.geocodeAddress, portado de DailySetupModal de LEDTracker).
 *  - La jornada referencia siteId, no un texto libre.
 *  - Límite de destinos por política (destinationLimit).
 *  - Archivar no borra historial.
 *  - Crear un sitio NO inicia geocerca (Propuesta de Producto §9).
 */
import type { CompanyPolicy, Site, SiteDraft } from "../../core/contracts";
import { normalizeArrivalDwellMs } from "./arrivalDwell";
import { isValidCoordinate } from "../../utils/geoUtils";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";

export type Geocoder = (address: string) => Promise<{ lat: number; lon: number } | null>;

let geocoder: Geocoder | null = null;

export type SiteResult =
  | { ok: true; site: Site; geocoded: boolean }
  | { ok: false; code: "ALIAS_REQUIRED" | "ADDRESS_REQUIRED" | "DESTINATION_LIMIT" | "SITE_NOT_FOUND" | "INVALID_RADIUS" };

export const SiteRegistryService = {
  /** Inyección del geocoder (runtime). */
  setGeocoder(g: Geocoder | null): void {
    geocoder = g;
  },

  async list(opts: { includeArchived?: boolean } = {}): Promise<Site[]> {
    return PersistenceService.listSites(opts);
  },

  async get(id: number): Promise<Site | null> {
    return PersistenceService.getSite(id);
  },

  /** Radio efectivo: propio del sitio o el de la política. */
  effectiveRadius(site: Site | null, company: CompanyPolicy): number {
    return site?.radiusM && site.radiusM > 0 ? site.radiusM : company.defaultRadiusM;
  },

  /** Alta o edición. Geocodifica si cambió la dirección o faltan coordenadas. */
  async upsert(draft: SiteDraft, company: CompanyPolicy): Promise<SiteResult> {
    const alias = draft.alias.trim();
    const address = draft.address.trim();
    if (!address) return { ok: false, code: "ADDRESS_REQUIRED" };
    if (!alias) return { ok: false, code: "ALIAS_REQUIRED" };
    if (draft.radiusM !== undefined && draft.radiusM !== null && !(draft.radiusM > 0)) {
      return { ok: false, code: "INVALID_RADIUS" };
    }

    const existing = draft.id ? await PersistenceService.getSite(draft.id) : null;
    if (draft.id && !existing) return { ok: false, code: "SITE_NOT_FOUND" };

    if (!existing) {
      const active = await PersistenceService.countActiveSites();
      if (active >= company.destinationLimit) return { ok: false, code: "DESTINATION_LIMIT" };
    }

    let targetLat = existing?.targetLat ?? null;
    let targetLon = existing?.targetLon ?? null;
    let geocoded = false;
    const addressChanged = !existing || existing.address !== address;
    if ((addressChanged || !isValidCoordinate(targetLat, targetLon)) && geocoder) {
      const g = await geocoder(address).catch(() => null);
      if (g && isValidCoordinate(g.lat, g.lon)) {
        targetLat = g.lat;
        targetLon = g.lon;
        geocoded = true;
      } else if (addressChanged) {
        targetLat = null;
        targetLon = null;
      }
    }

    const base = {
      alias,
      address,
      clientName: draft.clientName?.trim() || null,
      notes: draft.notes?.trim() || null,
      targetLat,
      targetLon,
      radiusM: draft.radiusM ?? existing?.radiusM ?? null,
      arrivalDwellMs:
        draft.arrivalDwellMs !== undefined ? normalizeArrivalDwellMs(draft.arrivalDwellMs) : (existing?.arrivalDwellMs ?? null),
    };

    if (existing) {
      const site: Site = { ...existing, ...base };
      await PersistenceService.updateSite(site);
      return { ok: true, site, geocoded };
    }

    const createdAtMs = TimeAuthorityService.now();
    const id = await PersistenceService.insertSite({ ...base, active: true, createdAtMs, archivedAtMs: null });
    return { ok: true, site: { ...base, id, active: true, createdAtMs, archivedAtMs: null }, geocoded };
  },

  /** Archivar: deja de ofrecerse en el picker; el historial se conserva. */
  async archive(id: number): Promise<SiteResult> {
    const site = await PersistenceService.getSite(id);
    if (!site) return { ok: false, code: "SITE_NOT_FOUND" };
    const next: Site = { ...site, active: false, archivedAtMs: TimeAuthorityService.now() };
    await PersistenceService.updateSite(next);
    return { ok: true, site: next, geocoded: false };
  },

  /** true si el sitio tiene coordenadas válidas para geocerca. */
  isGeofenceReady(site: Site | null): boolean {
    return !!site && isValidCoordinate(site.targetLat, site.targetLon);
  },
};
