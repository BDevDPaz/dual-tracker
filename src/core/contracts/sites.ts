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
  active: boolean;
  createdAtMs: number;
  archivedAtMs: number | null;
  /** Derivado (no persistido): última visita registrada a este siteId. */
  lastVisitAtMs?: number | null;
}

export interface SiteDraft {
  id?: number;
  alias: string;
  address: string;
  clientName?: string | null;
  notes?: string | null;
  radiusM?: number | null;
}
