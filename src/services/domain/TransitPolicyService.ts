/**
 * TransitPolicyService — Dominio (Propuesta Técnica §5.6, nuevo)
 * ============================================================================
 * Separa el traslado pagado del tiempo en sitio. Decide si el trayecto entre
 * sitio A y sitio B es remunerado, a qué tarifa y si cuenta para overtime.
 *  - Exige destino configurado antes de iniciar trayecto (validateStart).
 *  - Si el operador sale de A y no declara B en el plazo de decisión, el
 *    ledger marca PENDING_EXIT y no inventa un traslado (ver SessionEngine:
 *    la salida sin decisión nunca crea TransitSegment).
 *
 * Los valores (pagado / multiplicador / cuenta para OT) vienen de
 * CompanyPolicy; esta clase solo aplica la política declarada.
 * TODO: reglas por par de sitios (A→B) o por distancia no especificadas.
 */
import type { CompanyPolicy, TransitSegment } from "../../core/contracts";

export interface TransitDecision {
  paid: boolean;
  rateMultiplier: number;
  countsTowardOvertime: boolean;
}

export const TransitPolicyService = {
  decide(segment: TransitSegment, company: CompanyPolicy): TransitDecision {
    if (segment.cancelled) return { paid: false, rateMultiplier: 0, countsTowardOvertime: false };
    return {
      paid: company.transitPaid,
      rateMultiplier: company.transitRateMultiplier,
      countsTowardOvertime: company.transitPaid && company.transitCountsTowardOvertime,
    };
  },

  /** Validación previa a TRANSFER_START. */
  validateStart(fromSiteId: number | null, toSiteId: number | null): { ok: true } | { ok: false; code: "SITE_REQUIRED" } {
    if (toSiteId === null || toSiteId === undefined) return { ok: false, code: "SITE_REQUIRED" };
    if (fromSiteId !== null && fromSiteId === toSiteId) return { ok: false, code: "SITE_REQUIRED" };
    return { ok: true };
  },

  /** Minutos de un tramo (abierto → hasta `nowMs`). */
  segmentMinutes(segment: TransitSegment, nowMs: number): number {
    if (segment.cancelled) return 0;
    const end = segment.endAtMs ?? nowMs;
    return Math.max(0, Math.round((end - segment.startAtMs) / 60000));
  },
};
