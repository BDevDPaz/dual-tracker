/**
 * Sitio / destino (SiteRegistryService, Propuesta Técnica §5.5).
 * "Sitio con alias, cliente, coordenadas objetivo, radio propio y estado activo."
 */
export interface Site {
  id: number;
  alias: string;
  address: string;
  clientName: string | null;
  notes: string | null;
  targetLat: number | null;
  targetLon: number | null;
  /** Radio propio. null = usar CompanyPolicy.defaultRadiusM. */
  radiusM: number | null;
  /**
   * Espera antes del fichaje automático, en milisegundos.
   * null o ausente = usar el ajuste de la empresa. 0 = inmediato.
   */
  arrivalDwellMs?: number | null;
  active: boolean;
  createdAtMs: number;
  archivedAtMs: number | null;
  /** Derivado (no persistido): última visita registrada a este siteId. */
  lastVisitAtMs?: number | null;
  /** FieldCrypto v1.3 §14: campos ilegibles en este dispositivo (kid perdido). Derivado, no persistido. */
  unreadableFields?: ("alias" | "clientName" | "address" | "notes" | "coords")[];
}

export interface SiteDraft {
  id?: number;
  alias: string;
  address: string;
  clientName?: string | null;
  notes?: string | null;
  radiusM?: number | null;
  /** null = heredar el de la empresa. 0 = inmediato. */
  arrivalDwellMs?: number | null;
}
