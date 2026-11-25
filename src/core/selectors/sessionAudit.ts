/**
 * selectSessionAudit — Auditoría de una jornada (PR3). Función PURA.
 * ============================================================================
 * Lee solo lo que ya se registra: asientos del ledger de la sesión, el
 * registro de la sesión, los huecos de la miga y el sello SESSION_SEALED
 * (el hash recalculado llega en `inputs`, porque SHA-256 es asíncrono).
 *
 * No inventa: lo que no existe sale como AuditNotRecorded («no registrado»):
 * motivos de notas anteriores (solo hay noteDigest), autor (actor USER sin
 * persona), vía app/notificación (las dos son USER) y duración de GPS_LOST.
 */
import type {
  AuditConflict,
  AuditKind,
  AuditNote,
  AuditNotRecorded,
  AuditOrigin,
  AuditRow,
  AuditSealStatus,
  AuditChainStatus,
  AuditTimes,
  IntegrityClass,
  LedgerEntry,
  LedgerIncident,
  LedgerIntent,
  SessionAudit,
  SessionAuditInputs,
  SessionRecord,
} from "../contracts";

/** Correcciones: cambian horas o resuelven un conflicto. */
const CORRECTION_INTENTS: ReadonlySet<string> = new Set([
  "MANUAL_PATCH",
  "RESOLVE_KEEP_GPS",
  "RESOLVE_MANUAL",
  "RESOLVE_SPLIT",
  "CONFIRM_ORPHAN_END",
  "DELETE_SESSION",
]);

/** Intenciones que exigen nota: si falta la huella, la nota existió pero no se registró en el asiento. */
const NOTE_REQUIRED: ReadonlySet<string> = new Set(["MANUAL_PATCH", "ADD_NOTE", "RESOLVE_MANUAL", "RESOLVE_SPLIT", "CONFIRM_ORPHAN_END"]);

const KIND: Partial<Record<LedgerIntent, AuditKind>> = {
  START_DAY: "START",
  ARRIVAL_CONFIRMED: "ARRIVAL",
  EXIT_DETECTED: "EXIT",
  STAY_WORKING: "CONTINUE",
  CLOSE_DAY: "CLOSE",
  CANCEL_DAY: "CANCEL",
  SPATIAL_FACT: "SPATIAL",
  LUNCH_START: "BREAK",
  RESUME: "BREAK",
  ACK_REST: "BREAK",
  TRANSFER_START: "TRANSFER",
  TRANSFER_CANCEL: "TRANSFER",
  MANUAL_PATCH: "EDIT",
  ADD_NOTE: "NOTE",
  DELETE_SESSION: "DELETE",
  RESOLVE_KEEP_GPS: "RESOLUTION",
  RESOLVE_MANUAL: "RESOLUTION",
  RESOLVE_SPLIT: "RESOLUTION",
  INTEGRITY_DEGRADE: "INTEGRITY",
  INTEGRITY_RECLASSIFIED: "INTEGRITY",
  SESSION_QUARANTINED: "INTEGRITY",
  CERT_BLOCKER_ADDED: "INTEGRITY",
  AUTO_CLOSE: "AUTO_CLOSE",
  MARK_ORPHAN: "ORPHAN",
  CONTINUE_ORPHAN: "ORPHAN",
  CONFIRM_ORPHAN_END: "ORPHAN",
  EXTEND_SHIFT: "EXTEND",
  SESSION_SEALED: "SEAL",
  MONITORING_GAP: "MONITORING",
  OS_KILL: "MONITORING",
  BOOT_RESUME: "MONITORING",
  MONITORING_STOPPED_DETECTED: "MONITORING",
  SERVICE_RECOVERY: "MONITORING",
  SERVICE_RECOVERY_FAILED: "MONITORING",
  FOREGROUND_SERVICE_START_FAILED: "MONITORING",
  GPS_LOST: "MONITORING",
  GPS_RESTORED: "MONITORING",
  CLOCK_SAMPLED: "CLOCK",
  PERMISSION_REVOKED: "DEVICE",
  PERMISSION_GRANTED: "DEVICE",
  GPS_DISABLED: "DEVICE",
  GPS_ENABLED: "DEVICE",
  NOTIFICATION_DISABLED: "DEVICE",
  NOTIFICATION_POSTED: "DEVICE",
  NOTIFICATION_ACKNOWLEDGED: "DEVICE",
  BATTERY_OPTIMIZATION_ENABLED: "DEVICE",
  BATTERY_OPTIMIZATION_DISABLED: "DEVICE",
  DEVICE_INTEGRITY: "DEVICE",
  ANOMALY: "DEVICE",
};

type Data = Record<string, unknown>;

function dataOf(entry: LedgerEntry): Data {
  try {
    const body = JSON.parse(entry.payloadJson) as { data?: unknown };
    return body.data && typeof body.data === "object" && !Array.isArray(body.data) ? (body.data as Data) : {};
  } catch {
    return {};
  }
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function timesOf(v: unknown): AuditTimes | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Data;
  const declared = num(o.declaredStartAtMs);
  if (declared === undefined) return undefined;
  return { declaredStartAtMs: declared, actualStartAtMs: num(o.actualStartAtMs) ?? null, endAtMs: num(o.endAtMs) ?? null };
}

export function auditOrigin(entry: Pick<LedgerEntry, "actor" | "intent">): AuditOrigin {
  if (entry.actor === "GEOFENCE") return "GEOFENCE";
  if (entry.actor === "WATCHDOG" || entry.actor === "SYSTEM") return "SYSTEM";
  return CORRECTION_INTENTS.has(entry.intent) ? "CORRECTION" : "MANUAL";
}

function noteOf(entry: LedgerEntry, data: Data, latestNoteDigest: string | null, latestNote: string | null, matchedId: number | null): AuditNote {
  // Asientos v1: la nota iba en claro en el payload; es dato registrado.
  const plain = str(data.note);
  if (plain && plain.trim()) return { status: "READABLE", text: plain };
  if (matchedId === entry.id && latestNote && latestNoteDigest) return { status: "READABLE", text: latestNote };
  const digest = str(data.noteDigest);
  if (digest) return { status: "DIGEST_ONLY" };
  if (NOTE_REQUIRED.has(entry.intent)) return { status: "DIGEST_ONLY" };
  return { status: "NONE" };
}

function detailOf(entry: LedgerEntry, data: Data): AuditRow["detail"] {
  const d: AuditRow["detail"] = {};
  switch (entry.intent) {
    case "SPATIAL_FACT": {
      d.factType = str(data.type);
      d.reliable = bool(data.reliable);
      d.accuracyM = num(data.accuracyM) ?? null;
      const marker = "_UNRELIABLE:";
      const at = entry.reason.indexOf(marker);
      d.unreliableReason = at >= 0 ? entry.reason.slice(at + marker.length) || null : null;
      if (data.mocked === true) d.mocked = true;
      break;
    }
    case "EXIT_DETECTED":
    case "ARRIVAL_CONFIRMED": {
      const fact = data.fact && typeof data.fact === "object" ? (data.fact as Data) : null;
      if (fact) {
        d.factType = str(fact.type);
        d.reliable = bool(fact.reliable);
        d.accuracyM = num(fact.accuracyM) ?? null;
        d.unreliableReason = str(fact.reason) ?? null;
        if (fact.mocked === true) d.mocked = true;
      }
      break;
    }
    case "MANUAL_PATCH": {
      d.before = timesOf(data.before);
      d.after = timesOf(data.after);
      if (Array.isArray(data.clippedBreaks)) d.clippedBreaks = data.clippedBreaks.length;
      if (Array.isArray(data.clippedTransits)) d.clippedTransits = data.clippedTransits.length;
      break;
    }
    case "AUTO_CLOSE":
      d.cause = str(data.cause);
      d.confirmedOutside = bool(data.confirmedOutside);
      break;
    case "CLOSE_DAY":
      d.closeMode = str(data.mode);
      d.lunchDeductedMinutes = num(data.lunchDeductedMinutes) ?? null;
      break;
    case "MONITORING_GAP": {
      const s = num(data.gapSeconds);
      if (s !== undefined) d.gapMs = s * 1000;
      break;
    }
    case "OS_KILL":
      d.gapMs = num(data.gapMs);
      d.deviceOffMs = num(data.deviceOffMs);
      break;
    case "CLOCK_SAMPLED":
      d.driftMs = num(data.driftMs);
      d.suspect = bool(data.suspect);
      break;
    case "SESSION_SEALED":
      d.eventCount = num(data.eventCount);
      d.sessionHash = str(data.sessionHash);
      break;
    case "RESOLVE_SPLIT":
      d.newSessionId = num(data.newSessionId);
      d.splitFrom = num(data.splitFrom);
      d.splitAtMs = num(data.splitAtMs);
      break;
    default:
      break;
  }
  return d;
}

function notRecordedOf(entry: LedgerEntry, note: AuditNote): AuditNotRecorded[] {
  const out: AuditNotRecorded[] = [];
  if (entry.actor === "USER") {
    out.push("AUTHOR");
    if (!CORRECTION_INTENTS.has(entry.intent)) out.push("NOTIFICATION_CHANNEL");
  }
  if (note.status === "DIGEST_ONLY") out.push("PRIOR_REASONS");
  if (entry.intent === "GPS_LOST") out.push("GPS_LOSS_DURATION");
  return out;
}

function chainStatus(rows: readonly LedgerEntry[], incident: LedgerIncident | null): AuditChainStatus {
  if (!incident) return "OK";
  if (!rows.length) return "BROKEN_ELSEWHERE";
  const ids = rows.map((r) => r.id);
  const min = Math.min(...ids);
  const max = Math.max(...ids);
  return incident.breakAtId >= min && incident.breakAtId <= max ? "BROKEN_IN_SESSION" : "BROKEN_ELSEWHERE";
}

export function selectSessionAudit(
  session: SessionRecord,
  inputs: SessionAuditInputs,
  opts: { chainIncident?: LedgerIncident | null } = {},
): SessionAudit {
  const b = session.bookkeeping;
  const entries = inputs.ledger.filter((e) => e.sessionId === session.id).sort((a, b2) => a.id - b2.id);
  const latestNote = b.manualNote && b.manualNote.trim() ? b.manualNote : null;

  // La última nota legible solo se asocia al asiento cuya huella coincide (el último, si hay varios).
  let matchedId: number | null = null;
  if (inputs.latestNoteDigest) {
    for (const e of entries) if (str(dataOf(e).noteDigest) === inputs.latestNoteDigest) matchedId = e.id;
  }

  const rows: AuditRow[] = [];
  const conflicts: AuditConflict[] = [];
  let prevClass: IntegrityClass | null = null;
  for (const e of entries) {
    const data = dataOf(e);
    const note = noteOf(e, data, inputs.latestNoteDigest, latestNote, matchedId);
    const detail = detailOf(e, data);
    if (e.integrityClass) {
      if (e.integrityClass === "CONFLICT" && prevClass !== "CONFLICT") {
        detail.conflictOpened = true;
        conflicts.push({ openedAtMs: e.timestampMs, openedLedgerId: e.id, reason: e.reason, resolvedAtMs: null, resolvedLedgerId: null, resolvedBy: null });
      } else if (e.integrityClass !== "CONFLICT" && prevClass === "CONFLICT") {
        detail.conflictClosed = true;
        const open = conflicts[conflicts.length - 1];
        if (open && open.resolvedLedgerId === null) {
          open.resolvedAtMs = e.timestampMs;
          open.resolvedLedgerId = e.id;
          open.resolvedBy = e.intent;
        }
      }
      prevClass = e.integrityClass;
    }
    rows.push({
      ledgerId: e.id,
      atMs: e.timestampMs,
      origin: auditOrigin(e),
      kind: KIND[e.intent] ?? "OTHER",
      intent: e.intent,
      reason: e.reason,
      integrityClass: e.integrityClass,
      note,
      detail,
      notRecorded: notRecordedOf(e, note),
    });
  }

  const arrivalRow = rows.find((r) => r.intent === "ARRIVAL_CONFIRMED");
  const sealRows = rows.filter((r) => r.intent === "SESSION_SEALED");
  const lastSeal = sealRows[sealRows.length - 1] ?? null;
  const closed = session.domainStatus === "CERRADA";
  let sealStatus: AuditSealStatus;
  if (!lastSeal) sealStatus = closed ? "MISSING" : "OPEN";
  else sealStatus = lastSeal.detail.sessionHash && inputs.recomputedSealHash === lastSeal.detail.sessionHash ? "OK" : "MISMATCH";

  const firstAt = entries[0]?.timestampMs ?? session.declaredStartAtMs;
  const restores = inputs.restores.filter((r) => r.intent === "BACKUP_RESTORED" && r.timestampMs >= firstAt);
  const restoredAtMs = restores.length ? Math.max(...restores.map((r) => r.timestampMs)) : null;

  const notRecorded = [...new Set(rows.flatMap((r) => r.notRecorded))];
  const order: AuditNotRecorded[] = ["PRIOR_REASONS", "AUTHOR", "NOTIFICATION_CHANNEL", "GPS_LOSS_DURATION"];
  notRecorded.sort((x, y) => order.indexOf(x) - order.indexOf(y));

  return {
    sessionId: session.id,
    dateString: b.dateString,
    times: { declaredStartAtMs: session.declaredStartAtMs, actualStartAtMs: session.actualStartAtMs, endAtMs: session.endAtMs },
    arrival: arrivalRow ? { atMs: arrivalRow.atMs, origin: arrivalRow.origin, manualArrival: b.compliance?.manualArrival === true } : null,
    firstExit: b.firstExitAtMs !== null ? { atMs: b.firstExitAtMs, reliable: b.firstExitReliable } : null,
    lunch: session.lunch,
    pauses: b.pauses ?? [],
    pausesSource: b.pausesSource ?? "RECORDED",
    breaksClipped: b.breaksClipped === true,
    compliance: b.compliance ?? null,
    integrityClass: session.integrityClass,
    integrityReason: b.integrityReason,
    original: b.original ? { declaredStartAtMs: b.original.declaredStartAtMs, actualStartAtMs: b.original.actualStartAtMs, endAtMs: b.original.endAtMs } : null,
    latestNote,
    rows,
    conflicts,
    counts: {
      edits: rows.filter((r) => r.kind === "EDIT").length,
      conflicts: conflicts.length,
      resolved: conflicts.filter((c) => c.resolvedLedgerId !== null).length,
      autoCloses: rows.filter((r) => r.kind === "AUTO_CLOSE").length,
      monitoringGaps: rows.filter((r) => r.intent === "MONITORING_GAP").length,
      osKills: rows.filter((r) => r.intent === "OS_KILL").length,
      gpsLosses: rows.filter((r) => r.intent === "GPS_LOST").length,
      unreliableFacts: rows.filter((r) => (r.kind === "SPATIAL" || r.kind === "EXIT") && r.detail.reliable === false).length,
      trailGaps: inputs.trailGaps.length,
    },
    seal: { status: sealStatus, atMs: lastSeal?.atMs ?? null, eventCount: lastSeal?.detail.eventCount ?? null, eventsAfter: lastSeal ? rows.filter((r) => r.ledgerId > lastSeal.ledgerId).length : 0 },
    chain: chainStatus(entries, opts.chainIncident ?? null),
    trailGaps: inputs.trailGaps,
    restoredAtMs,
    notRecorded,
  };
}

/** Fila resumida para la sección de auditoría de la vista previa del periodo. */
export interface PeriodAuditRow {
  sessionId: number;
  dateString: string;
  integrityClass: IntegrityClass;
  edits: number;
  conflictsOpen: number;
  conflictsResolved: number;
  autoClosed: boolean;
  seal: AuditSealStatus;
  trailGaps: number;
  monitoringGaps: number;
}

export function selectPeriodAuditRows(audits: readonly SessionAudit[]): PeriodAuditRow[] {
  return [...audits]
    .sort((a, b) => a.times.declaredStartAtMs - b.times.declaredStartAtMs)
    .map((a) => ({
      sessionId: a.sessionId,
      dateString: a.dateString,
      integrityClass: a.integrityClass,
      edits: a.counts.edits,
      conflictsOpen: a.counts.conflicts - a.counts.resolved,
      conflictsResolved: a.counts.resolved,
      autoClosed: a.counts.autoCloses > 0,
      seal: a.seal.status,
      trailGaps: a.counts.trailGaps,
      monitoringGaps: a.counts.monitoringGaps + a.counts.osKills,
    }));
}
