/**
 * Retención de la miga de pan (tanda 1).
 * Un punto solo se puede expurgar si su periodo está exportado (hay un
 * expediente sellado que lo cubre) Y ya pasó el mínimo de días desde el fin
 * de ese periodo. Las dos condiciones. Un periodo sin exportar no se toca.
 */
export const RETENTION_DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionPhase = "UNEXPORTED" | "RETAINING" | "ELIGIBLE";

export interface PeriodBounds {
  periodStart: number;
  periodEnd: number;
}

export function retentionPhase(
  nowMs: number,
  retentionDays: number,
  period: PeriodBounds,
  exported: boolean,
): { phase: RetentionPhase; eligibleAtMs: number } {
  const eligibleAtMs = period.periodEnd + retentionDays * RETENTION_DAY_MS;
  if (!exported) return { phase: "UNEXPORTED", eligibleAtMs };
  if (nowMs < eligibleAtMs) return { phase: "RETAINING", eligibleAtMs };
  return { phase: "ELIGIBLE", eligibleAtMs };
}

/** Fase de un punto según los periodos sellados que lo cubren. */
export function trailPointPhase(
  timestampMs: number,
  packs: PeriodBounds[],
  nowMs: number,
  retentionDays: number,
): RetentionPhase {
  const covers = packs.filter((p) => p.periodStart <= timestampMs && timestampMs <= p.periodEnd);
  if (!covers.length) return "UNEXPORTED";
  const phases = covers.map((p) => retentionPhase(nowMs, retentionDays, p, true).phase);
  return phases.every((p) => p === "ELIGIBLE") ? "ELIGIBLE" : "RETAINING";
}
