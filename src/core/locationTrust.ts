/**
 * Puntaje informativo de confianza de la ubicación, 0–100.
 * No entra en la nómina ni en VALIDADA.
 *
 * Parte de 100 y resta, acotado a 0–100:
 *  - precisión (mediana): sin muestras 15; >20 m 8; >50 m 15; >100 m 25
 *  - ubicación simulada: 55
 *  - root: 35
 *  - saltos: 20 cada uno, tope 40
 *  - estabilidad: aleteos de más y pérdidas de señal, tope 20
 *  - huecos de monitoreo: 12 cada uno, tope 24
 *
 * 90–100 Excelente, 75–89 Buena, 50–74 Regular, 0–49 Sospechosa.
 */
export const TRUST_LABELS = ["EXCELLENT", "GOOD", "FAIR", "SUSPICIOUS"] as const;

export type TrustLabel = (typeof TRUST_LABELS)[number];

export interface TrustFactors {
  accuraciesM: number[];
  mocked: boolean;
  rooted: boolean;
  jumpCount: number;
  /** Cambios ENTER/EXIT en la jornada. Uno solo (entrar, o entrar y salir) no penaliza. */
  boundaryFlips: number;
  signalLossCount: number;
  gapCount: number;
}

export interface TrustPenalty {
  accuracy: number;
  mock: number;
  root: number;
  jumps: number;
  stability: number;
  gaps: number;
}

export interface TrustScore {
  score: number;
  label: TrustLabel;
  penalties: TrustPenalty;
}

export function trustLabel(score: number): TrustLabel {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 50) return "FAIR";
  return "SUSPICIOUS";
}

function accuracyPenalty(accuraciesM: number[]): number {
  const usable = accuraciesM.filter((n) => Number.isFinite(n) && n >= 0);
  if (!usable.length) return 15;
  const sorted = [...usable].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  if (median > 100) return 25;
  if (median > 50) return 15;
  if (median > 20) return 8;
  return 0;
}

export function scoreLocationTrust(factors: TrustFactors): TrustScore {
  const penalties: TrustPenalty = {
    accuracy: accuracyPenalty(factors.accuraciesM),
    mock: factors.mocked ? 55 : 0,
    root: factors.rooted ? 35 : 0,
    jumps: Math.min(40, Math.max(0, factors.jumpCount) * 20),
    stability: Math.min(20, Math.max(0, factors.boundaryFlips - 1) * 8 + Math.max(0, factors.signalLossCount) * 6),
    gaps: Math.min(24, Math.max(0, factors.gapCount) * 12),
  };
  const spent = penalties.accuracy + penalties.mock + penalties.root + penalties.jumps + penalties.stability + penalties.gaps;
  const score = Math.max(0, Math.min(100, 100 - spent));
  return { score, label: trustLabel(score), penalties };
}

type BoundaryEvent = { type: string; atMs?: number; timestampMs?: number };

function eventAt(event: BoundaryEvent): number {
  return event.atMs ?? event.timestampMs ?? 0;
}

/** Alternancias de tipo entre ENTER y EXIT, en orden. Acepta atMs o timestampMs. */
export function countBoundaryFlips(events: BoundaryEvent[]): number {
  const ordered = events
    .filter((event) => event.type === "ENTER" || event.type === "EXIT")
    .slice()
    .sort((a, b) => eventAt(a) - eventAt(b) || (a.type === "ENTER" ? -1 : 1));
  let flips = 0;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].type !== ordered[i - 1].type) flips++;
  }
  return flips;
}

/** Aleteo: 3 o más alternancias dentro de la ventana. */
export function isBoundaryFlapping(events: BoundaryEvent[], nowMs: number, windowMs = 10 * 60_000): boolean {
  const recent = events.filter((event) => {
    const age = nowMs - eventAt(event);
    return age <= windowMs && age >= 0;
  });
  return countBoundaryFlips(recent) >= 3;
}
