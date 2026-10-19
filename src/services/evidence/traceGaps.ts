/**
 * Huecos de la miga. No se inventa el tramo que falta.
 * Si el punto medio ya se puede expurgar, el hueco es de retención.
 * Si no, es un hueco de registro (el teléfono no guardó ese trecho).
 */
import { BREADCRUMB_GAP_FACTOR, BREADCRUMB_PROFILES } from "../../config/provisional";
import { trailPointPhase, type PeriodBounds } from "./retentionRules";

export type TraceGapKind = "retention" | "recording";

export interface TraceGap {
  /** Índice, en la lista de migas ordenadas, del punto que sigue al hueco. */
  afterIndex: number;
  kind: TraceGapKind;
  fromMs: number;
  toMs: number;
}

export function classifyBreadcrumbGaps(
  crumbs: readonly { timestampMs: number }[],
  packs: readonly PeriodBounds[],
  nowMs: number,
  retentionDays: number,
  sampleMs = BREADCRUMB_PROFILES.ON_SITE.timeIntervalMs,
  factor = BREADCRUMB_GAP_FACTOR,
): TraceGap[] {
  const quiet = sampleMs * factor;
  const gaps: TraceGap[] = [];
  for (let i = 1; i < crumbs.length; i++) {
    const fromMs = crumbs[i - 1].timestampMs;
    const toMs = crumbs[i].timestampMs;
    if (toMs - fromMs <= quiet) continue;
    const mid = fromMs + (toMs - fromMs) / 2;
    const kind = trailPointPhase(mid, [...packs], nowMs, retentionDays) === "ELIGIBLE" ? "retention" : "recording";
    gaps.push({ afterIndex: i, kind, fromMs, toMs });
  }
  return gaps;
}

export function traceHasRetentionGap(gaps: readonly TraceGap[]): boolean {
  return gaps.some((g) => g.kind === "retention");
}
