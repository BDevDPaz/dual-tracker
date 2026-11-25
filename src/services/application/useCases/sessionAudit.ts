/**
 * Lecturas asíncronas de la Auditoría de jornadas (PR3). Solo lee.
 * El cálculo es del selector puro `selectSessionAudit` (core/selectors):
 * aquí se juntan el ledger de la sesión, los huecos de la miga, el hash
 * recalculado del sello SESSION_SEALED y la huella de la última nota.
 */
import type { LedgerEntry, SessionAuditInputs, SessionRecord } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { sessionEventHash } from "../../evidence/HashChain";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { SESSION_SEAL_INTENT } from "../../evidence/sessionSeal";
import { classifyBreadcrumbGaps } from "../../evidence/traceGaps";
import { PersistenceService } from "../../persistence/PersistenceService";

/** Hash de los asientos previos al último sello (misma regla que sessionSealFailure). */
export async function recomputeSessionSeal(ledger: readonly LedgerEntry[]): Promise<string | null> {
  const sorted = [...ledger].sort((a, b) => a.id - b.id);
  const seals = sorted.filter((e) => e.intent === SESSION_SEAL_INTENT);
  const last = seals[seals.length - 1];
  if (!last) return null;
  const prior = sorted.filter((e) => e.id < last.id && e.intent !== SESSION_SEAL_INTENT && e.sessionId === last.sessionId);
  return sessionEventHash(prior.map((e) => e.hash));
}

async function trailGapsFor(sessionId: number) {
  const facts = await PersistenceService.listSpatialFacts(sessionId).catch(() => []);
  const crumbs = facts.filter((f) => f.type === "BREADCRUMB").map((f) => ({ timestampMs: f.timestampMs }));
  const state = Store.getState();
  const packs = Object.values(state.packs.byId).map((p) => ({ periodStart: p.manifest.periodStart, periodEnd: p.manifest.periodEnd }));
  return classifyBreadcrumbGaps(crumbs, packs, TimeAuthorityService.now(), state.settings.company.traceRetentionDays).map((g) => ({
    kind: g.kind,
    fromMs: g.fromMs,
    toMs: g.toMs,
  }));
}

export async function loadSessionAuditInputs(session: SessionRecord, restores?: LedgerEntry[]): Promise<SessionAuditInputs> {
  const ledger = await IntegrityLedgerService.listForSession(session.id);
  const [trailGaps, recomputedSealHash, latestNoteDigest, restoreRows] = await Promise.all([
    trailGapsFor(session.id),
    recomputeSessionSeal(ledger),
    IntegrityLedgerService.noteDigest(session.bookkeeping.manualNote),
    restores ? Promise.resolve(restores) : PersistenceService.listLedger({ intent: "BACKUP_RESTORED" }),
  ]);
  return { ledger, trailGaps, recomputedSealHash, latestNoteDigest, restores: restoreRows };
}

/** Entradas de varias jornadas (vista previa del periodo). Una sola lectura de restauraciones. */
export async function loadPeriodAuditInputs(sessions: readonly SessionRecord[]): Promise<Map<number, SessionAuditInputs>> {
  const restores = await PersistenceService.listLedger({ intent: "BACKUP_RESTORED" });
  const out = new Map<number, SessionAuditInputs>();
  for (const s of sessions) out.set(s.id, await loadSessionAuditInputs(s, restores));
  return out;
}
