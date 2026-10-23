/**
 * Reconstruye los minutos de cada jornada desde los asientos del libro y
 * los compara con la fila de `sessions`. Un desajuste es un hallazgo de
 * integridad. No escribe la fila ni cambia el pago.
 *
 * La reconstrucción vuelve a aplicar la máquina de estados ya existente
 * (no la modifica) con la hora de cada asiento. Si un paso no se puede
 * repetir, el resultado es INCOMPLETE: no se presenta como desajuste.
 */
import type { CompanyPolicy, LedgerEntry, SessionIntent, SessionRecord, SpatialFact } from "../../core/contracts";
import { computeSessionMinutes } from "./PayrollEngineService";
import { transition } from "./sessionMachine";

export interface ReplayMinutes {
  workedMinutes: number;
  transitMinutes: number;
  breakMinutes: number;
}

export type ReplayStatus = "MATCH" | "MISMATCH" | "INCOMPLETE" | "SKIPPED";

export interface SessionReplayFinding {
  sessionId: number;
  status: ReplayStatus;
  stored: ReplayMinutes | null;
  ledger: ReplayMinutes | null;
}

const REPLAYABLE = new Set<string>([
  "START_DAY",
  "CANCEL_DAY",
  "ARRIVAL_CONFIRMED",
  "LUNCH_START",
  "RESUME",
  "TRANSFER_START",
  "TRANSFER_CANCEL",
  "EXIT_DETECTED",
  "STAY_WORKING",
  "CLOSE_DAY",
  "AUTO_CLOSE",
  "MANUAL_PATCH",
  "ADD_NOTE",
  "DELETE_SESSION",
  "RESOLVE_KEEP_GPS",
  "RESOLVE_MANUAL",
  "RESOLVE_SPLIT",
  "MARK_ORPHAN",
  "CONTINUE_ORPHAN",
  "CONFIRM_ORPHAN_END",
  "INTEGRITY_DEGRADE",
]);

function dataOf(entry: LedgerEntry): Record<string, unknown> {
  try {
    const data = (JSON.parse(entry.payloadJson) as { data?: unknown }).data;
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    // El asiento no se puede leer: la jornada queda incompleta.
  }
  return {};
}

function noteOf(data: Record<string, unknown>): string {
  return typeof data.note === "string" && data.note.trim() ? data.note : "replay";
}

function factOf(data: Record<string, unknown>, sessionId: number, fallbackType: SpatialFact["type"]): SpatialFact {
  const raw = data.fact;
  const fact = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const timestamp = typeof fact.timestampMs === "number" ? fact.timestampMs : 0;
  return {
    sessionId,
    type: fallbackType,
    lat: typeof fact.lat === "number" ? fact.lat : 0,
    lon: typeof fact.lon === "number" ? fact.lon : 0,
    accuracyM: typeof fact.accuracyM === "number" ? fact.accuracyM : null,
    timestampMs: timestamp,
    source: fact.source === "gps" || fact.source === "network" || fact.source === "unknown" ? fact.source : "unknown",
    reliable: fact.reliable !== false,
    reason: typeof fact.reason === "string" ? fact.reason : null,
    siteId: typeof fact.siteId === "number" ? fact.siteId : null,
  };
}

function intentOf(entry: LedgerEntry, data: Record<string, unknown>): SessionIntent | null {
  const sessionId = entry.sessionId ?? 0;
  switch (entry.intent) {
    case "START_DAY":
      return { type: "START_DAY", siteId: typeof data.siteId === "number" ? data.siteId : 0, clientId: typeof data.clientId === "string" ? data.clientId : null };
    case "CANCEL_DAY":
      return { type: "CANCEL_DAY" };
    case "ARRIVAL_CONFIRMED":
      return data.fact ? { type: "ARRIVAL_CONFIRMED", fact: factOf(data, sessionId, "ENTER") } : { type: "ARRIVAL_CONFIRMED" };
    case "LUNCH_START":
      return { type: "LUNCH_START" };
    case "RESUME":
      return { type: "RESUME" };
    case "TRANSFER_START":
      return { type: "TRANSFER_START", toSiteId: typeof data.toSiteId === "number" ? data.toSiteId : 0 };
    case "TRANSFER_CANCEL":
      return { type: "TRANSFER_CANCEL" };
    case "EXIT_DETECTED":
      return { type: "EXIT_DETECTED", fact: factOf(data, sessionId, "EXIT") };
    case "STAY_WORKING":
      return { type: "STAY_WORKING" };
    case "CLOSE_DAY":
      return {
        type: "CLOSE_DAY",
        mode: data.mode === "EXIT_CONFIRMED" ? "EXIT_CONFIRMED" : "MANUAL",
        ...(typeof data.lunchDeductedMinutes === "number" ? { lunchDeductedMinutes: data.lunchDeductedMinutes } : {}),
        ...(typeof data.lunchStartAtMs === "number" ? { lunchStartAtMs: data.lunchStartAtMs } : {}),
        ...(typeof data.waiveFirstMeal === "boolean" ? { waiveFirstMeal: data.waiveFirstMeal } : {}),
        ...(typeof data.waiveSecondMeal === "boolean" ? { waiveSecondMeal: data.waiveSecondMeal } : {}),
        ...(typeof data.mealInterrupted === "boolean" ? { mealInterrupted: data.mealInterrupted } : {}),
        ...(typeof data.restBreaksTaken === "boolean" ? { restBreaksTaken: data.restBreaksTaken } : {}),
      };
    case "ACK_REST":
      return { type: "ACK_REST", taken: data.taken !== false };
    case "AUTO_CLOSE":
      return {
        type: "AUTO_CLOSE",
        cause:
          data.cause === "MAX_OPEN_12H" || data.cause === "EXIT_DECISION_EXPIRED" || data.cause === "ABANDONMENT_CONFIRMED" || data.cause === "PROVIDER_LOSS"
            ? data.cause
            : "MAX_OPEN_12H",
        confirmedOutside: data.confirmedOutside === true,
      };
    case "MANUAL_PATCH":
      return {
        type: "MANUAL_PATCH",
        sessionId,
        declaredStartAtMs: typeof data.declaredStartAtMs === "number" ? data.declaredStartAtMs : Number.NaN,
        endAtMs: typeof data.endAtMs === "number" ? data.endAtMs : data.endAtMs === null ? null : null,
        note: noteOf(data),
      };
    case "ADD_NOTE":
      return { type: "ADD_NOTE", sessionId, note: noteOf(data) };
    case "DELETE_SESSION":
      return { type: "DELETE_SESSION", sessionId };
    case "RESOLVE_KEEP_GPS":
      return { type: "RESOLVE_KEEP_GPS", sessionId };
    case "RESOLVE_MANUAL":
      return { type: "RESOLVE_MANUAL", sessionId, note: noteOf(data) };
    case "RESOLVE_SPLIT":
      return { type: "RESOLVE_SPLIT", sessionId, splitAtMs: typeof data.splitAtMs === "number" ? data.splitAtMs : Number.NaN, note: noteOf(data) };
    case "MARK_ORPHAN":
      return { type: "MARK_ORPHAN" };
    case "CONTINUE_ORPHAN":
      return { type: "CONTINUE_ORPHAN" };
    case "CONFIRM_ORPHAN_END":
      return { type: "CONFIRM_ORPHAN_END", endAtMs: typeof data.endAtMs === "number" ? data.endAtMs : Number.NaN, note: noteOf(data) };
    case "INTEGRITY_DEGRADE": {
      const cause = data.cause;
      if (
        cause === "BACKGROUND_PERMISSION_MISSING" ||
        cause === "LOCATION_FOREGROUND_MISSING" ||
        cause === "LOCATION_SERVICES_DISABLED" ||
        cause === "FOREGROUND_SERVICE_STOPPED" ||
        cause === "CLOCK_DRIFT" ||
        cause === "MUTEX_FAILED" ||
        cause === "PROVIDER_LOSS" ||
        cause === "LEDGER_CHAIN_BROKEN" ||
        cause === "FIELD_CRYPTO_KEY_LOST"
      ) {
        return { type: "INTEGRITY_DEGRADE", cause };
      }
      return null;
    }
    default:
      return null;
  }
}

export function replayMinutesOf(session: SessionRecord, company: CompanyPolicy, nowMs: number): ReplayMinutes | null {
  const minutes = computeSessionMinutes(session, company, nowMs);
  if (!minutes) return null;
  return {
    workedMinutes: minutes.workMinutes,
    transitMinutes: minutes.transitPaidMinutes,
    breakMinutes: minutes.lunchMinutes + minutes.pauseMinutes,
  };
}

function sameMinutes(a: ReplayMinutes | null, b: ReplayMinutes | null): boolean {
  if (a === null || b === null) return a === b;
  return a.workedMinutes === b.workedMinutes && a.transitMinutes === b.transitMinutes && a.breakMinutes === b.breakMinutes;
}

/**
 * Compara cada fila con la reconstrucción de sus asientos.
 * `entries` puede ser el libro entero: se agrupa por sessionId.
 */
export function compareSessionsToLedger(
  sessions: readonly SessionRecord[],
  entries: readonly LedgerEntry[],
  company: CompanyPolicy,
  nowMs: number,
): SessionReplayFinding[] {
  const bySession = new Map<number, LedgerEntry[]>();
  for (const entry of entries) {
    if (entry.sessionId === null) continue;
    const list = bySession.get(entry.sessionId) ?? [];
    list.push(entry);
    bySession.set(entry.sessionId, list);
  }
  const halves = new Map<number, SessionRecord>();
  let seq = 0;

  const replayOne = (sessionId: number): { record: SessionRecord | null; incomplete: boolean; skipped: boolean } => {
    const rows = (bySession.get(sessionId) ?? []).slice().sort((a, b) => a.id - b.id);
    const playable = rows.filter((row) => REPLAYABLE.has(row.intent));
    if (!playable.length && !halves.has(sessionId)) return { record: null, incomplete: false, skipped: true };
    let current: SessionRecord | null = halves.get(sessionId) ?? null;
    if (!current && playable[0]?.reason === "SESSION_SPLIT_CREATED") {
      const parent = entries.find((entry) => entry.intent === "RESOLVE_SPLIT" && dataOf(entry).newSessionId === sessionId && entry.sessionId !== sessionId);
      if (parent?.sessionId) replayOne(parent.sessionId);
      current = halves.get(sessionId) ?? null;
    }
    for (const entry of playable) {
      if (entry.intent === "RESOLVE_SPLIT" && entry.reason === "SESSION_SPLIT_CREATED") {
        if (!current && halves.has(sessionId)) current = halves.get(sessionId) ?? null;
        continue;
      }
      const data = dataOf(entry);
      const intent = intentOf(entry, data);
      if (!intent) return { record: current, incomplete: true, skipped: false };
      const open = current && current.domainStatus !== "CERRADA" ? current : null;
      const out = transition(
        entry.intent === "START_DAY" ? null : open,
        intent,
        {
          nowMs: entry.timestampMs,
          notAfterMs: Number.MAX_SAFE_INTEGER,
          actor: entry.actor,
          policyId: company.overtimePolicyId,
          company,
          disclosureAccepted: true,
          degradedReason: null,
          overlap: false,
          splitOverlap: { a: false, b: false },
          siteExists: () => true,
          cleanGpsPair: true,
          newId: () => `replay-${entry.id}-${++seq}`,
        },
        current,
      );
      if (!out.ok) return { record: current, incomplete: true, skipped: false };
      current = { ...out.next, id: sessionId };
      if (out.extra && typeof data.newSessionId === "number") halves.set(data.newSessionId, { ...out.extra, id: data.newSessionId });
    }
    return { record: current, incomplete: false, skipped: false };
  };

  return sessions.map((session) => {
    const stored = replayMinutesOf(session, company, nowMs);
    const replay = replayOne(session.id);
    if (replay.skipped) return { sessionId: session.id, status: "SKIPPED", stored, ledger: null };
    if (replay.incomplete || !replay.record) return { sessionId: session.id, status: "INCOMPLETE", stored, ledger: null };
    const ledger = replayMinutesOf(replay.record, company, nowMs);
    return { sessionId: session.id, status: sameMinutes(stored, ledger) ? "MATCH" : "MISMATCH", stored, ledger };
  });
}
