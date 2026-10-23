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
 * CompanyPolicy. Al cerrar el tramo la máquina congela `paid`,
 * `rateMultiplier` y `countsTowardOvertime`: un cambio posterior de la
 * política no reescribe el tramo. `paid === null` (abierto o legado) sigue
 * la política vigente.
 * TODO: reglas por par de sitios (A→B) o por distancia no especificadas.
 * No hay mínimo ni máximo de minutos: se redondea cada tramo al minuto.
 */
import type { CompanyPolicy, TransitSegment } from "../../core/contracts";

export interface TransitDecision {
  paid: boolean;
  rateMultiplier: number;
  countsTowardOvertime: boolean;
}

/**
 * Un cancelado legado (`paid !== true`) no se paga: ese tiempo contaba como
 * jornada. Uno nuevo se congela `paid: true`. Si `countsTowardOvertime` es
 * true, entra en la cubeta de extras (D11). Un mandado (`purpose: ERRAND`)
 * se paga a 1× y cuenta para extras, también de vuelta al mismo sitio.
 * Un tramo suprimido por un recorte no se paga.
 */
export function transitIgnored(segment: TransitSegment): boolean {
  if (segment.suppressed) return true;
  if (segment.cancelled && segment.paid !== true) return true;
  return false;
}

export const TransitPolicyService = {
  decide(segment: TransitSegment, company: CompanyPolicy): TransitDecision {
    if (segment.suppressed || segment.paid === false) return { paid: false, rateMultiplier: 0, countsTowardOvertime: false };
    if (segment.purpose === "ERRAND") {
      return { paid: true, rateMultiplier: segment.rateMultiplier ?? 1, countsTowardOvertime: true };
    }
    if (segment.cancelled && segment.paid === true) {
      return {
        paid: true,
        rateMultiplier: segment.rateMultiplier ?? 1,
        countsTowardOvertime: segment.countsTowardOvertime === true,
      };
    }
    if (segment.cancelled) return { paid: false, rateMultiplier: 0, countsTowardOvertime: false };
    if (segment.paid === true) {
      return {
        paid: true,
        rateMultiplier: segment.rateMultiplier ?? company.transitRateMultiplier,
        countsTowardOvertime: segment.countsTowardOvertime ?? company.transitCountsTowardOvertime,
      };
    }
    return {
      paid: company.transitPaid,
      rateMultiplier: company.transitRateMultiplier,
      countsTowardOvertime: company.transitPaid && company.transitCountsTowardOvertime,
    };
  },

  /** Validación previa a TRANSFER_START. */
  validateStart(
    fromSiteId: number | null,
    toSiteId: number | null,
    purpose?: "ERRAND",
  ): { ok: true } | { ok: false; code: "SITE_REQUIRED" } {
    if (toSiteId === null || toSiteId === undefined || toSiteId === 0) return { ok: false, code: "SITE_REQUIRED" };
    if (fromSiteId !== null && fromSiteId === toSiteId && purpose !== "ERRAND") return { ok: false, code: "SITE_REQUIRED" };
    return { ok: true };
  },

  /** Minutos de un tramo (abierto → hasta `nowMs`). No recorta a la jornada. */
  segmentMinutes(segment: TransitSegment, nowMs: number): number {
    if (transitIgnored(segment)) return 0;
    const end = segment.endAtMs ?? nowMs;
    return Math.max(0, Math.round((end - segment.startAtMs) / 60000));
  },

  /**
   * Minutos del tramo dentro de [boundStart, boundEnd]. El tiempo que queda
   * fuera de la jornada (p. ej. tras un MANUAL_PATCH) no se paga.
   */
  boundedMinutes(segment: TransitSegment, boundStart: number, boundEnd: number): number {
    if (transitIgnored(segment) || !(boundEnd > boundStart)) return 0;
    const end = Math.min(segment.endAtMs ?? boundEnd, boundEnd);
    const start = Math.max(segment.startAtMs, boundStart);
    if (end <= start) return 0;
    return Math.round((end - start) / 60000);
  },

  /** true si el tramo, tal como está guardado, sale del intervalo de la jornada. */
  overlapsOutside(segment: TransitSegment, boundStart: number, boundEnd: number): boolean {
    if (transitIgnored(segment)) return false;
    const end = segment.endAtMs ?? boundEnd;
    return segment.startAtMs < boundStart || end > boundEnd;
  },
};
