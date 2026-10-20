/**
 * IntegrityLedgerService — Dominio (Propuesta Técnica §5.3, nuevo, crítico)
 * ============================================================================
 * Libro de evidencia append-only. Cada intención, hecho GPS, edición manual y
 * cierre genera un asiento con hash encadenado (hash del asiento anterior +
 * payload). Clases VALID / MANUAL / AUTO / CONFLICT; no se degradan en silencio.
 *
 * El PDF y la pantalla de historial leen el ledger; no reconstruyen la historia
 * a partir del último UPDATE. Sustituye a audit_logs / IntegrityBadge "de
 * adorno" de los linajes anteriores (audit_logs se conserva como stream AUDIT
 * operativo en LoggingService).
 *
 * Nota de capas: el cálculo SHA-256 (expo-crypto) vive en HashChain (Evidencia)
 * y la escritura en PersistenceService; el ledger solo orquesta.
 */
import type * as SQLite from "expo-sqlite";
import type {
  EvidenceSummary,
  LedgerDraft,
  LedgerEntry,
  LedgerIncident,
  LedgerSegment,
  LedgerVerification,
  SessionRecord,
} from "../../core/contracts";
import { GENESIS_HASH } from "../../core/contracts";
import { canonicalJson } from "../../utils/canonicalJson";
import { chainHash, sha256Hex } from "../evidence/HashChain";
import { PersistenceService } from "../persistence/PersistenceService";

/** Claves KV del estado de integridad (spec v1.3 §5.5). */
export const LEDGER_KV = {
  VERIFIED_THROUGH: "ledger.verified_through",
  BROKEN: "ledger.broken",
} as const;

/** Campos del asiento LEDGER_BREAK_ACKNOWLEDGED (spec v1.3 §5.5). */
export interface LedgerBreakAck {
  breakAtId: number;
  lastGoodId: number | null;
  lastGoodHash: string;
  observedPrevHash: string;
  observedHash: string;
  recomputedHash: string;
  headAtAckId: number;
  headAtAckHash: string;
  incidentHash: string;
  acknowledgedAtMs: number;
}

const INCIDENT_FIELDS: (keyof LedgerIncident)[] = [
  "breakAtId",
  "lastGoodId",
  "lastGoodHash",
  "observedPrevHash",
  "observedHash",
  "recomputedHash",
  "detectedAtMs",
  "headAtDetection",
];

function parseData<T>(e: LedgerEntry): T | null {
  try {
    const p = JSON.parse(e.payloadJson) as { data?: T };
    return p.data ?? null;
  } catch {
    return null;
  }
}

/** Asientos de reconocimiento de ruptura presentes en la cadena. */
function acksOf(entries: LedgerEntry[]): (LedgerBreakAck & { ackId: number })[] {
  return entries
    .filter((e) => e.intent === "LEDGER_BREAK_ACKNOWLEDGED")
    .map((e) => ({ ...(parseData<LedgerBreakAck>(e) as LedgerBreakAck), ackId: e.id }))
    .filter((a) => typeof a.breakAtId === "number");
}

/**
 * Verificación por segmentos (spec v1.3 §5.5). Un asiento que no verifica es
 * una ruptura. Si existe un LEDGER_BREAK_ACKNOWLEDGED posterior cuyos campos
 * coinciden (breakAtId, lastGoodId, observedHash), el asiento queda en
 * cuarentena y se abre un segmento nuevo anclado en su hash guardado. Nunca se
 * recalculan ni reescriben hashes.
 */
async function verifySegments(entries: LedgerEntry[], anchor = GENESIS_HASH, lastGoodInit: { id: number; hash: string } | null = null): Promise<LedgerVerification> {
  const acks = new Map(acksOf(entries).map((a) => [a.breakAtId, a]));
  const segments: LedgerSegment[] = [];
  const quarantinedIds: number[] = [];
  let acknowledgedBreaks = 0;
  let expectedPrev = anchor;
  let lastGood = lastGoodInit;
  let seg: LedgerSegment = { fromId: entries[0]?.id ?? null, toId: null, anchor, valid: true };

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const recomputed = await chainHash(expectedPrev, e.payloadJson);
    if (e.prevHash === expectedPrev && recomputed === e.hash) {
      expectedPrev = e.hash;
      lastGood = { id: e.id, hash: e.hash };
      seg.toId = e.id;
      continue;
    }
    const ack = acks.get(e.id);
    if (ack && ack.ackId > e.id && ack.observedHash === e.hash && ack.lastGoodId === (lastGood?.id ?? null)) {
      segments.push({ ...seg, toId: lastGood?.id ?? null });
      quarantinedIds.push(e.id);
      acknowledgedBreaks++;
      expectedPrev = e.hash;
      seg = { fromId: entries[i + 1]?.id ?? null, toId: null, anchor: e.hash, valid: true };
      continue;
    }
    segments.push({ ...seg, toId: lastGood?.id ?? null, valid: false });
    return {
      valid: false,
      brokenAtId: e.id,
      head: entries[entries.length - 1].hash,
      segments,
      acknowledgedBreaks,
      quarantinedIds,
      incident: {
        breakAtId: e.id,
        lastGoodId: lastGood?.id ?? null,
        lastGoodHash: lastGood?.hash ?? GENESIS_HASH,
        observedPrevHash: e.prevHash,
        observedHash: e.hash,
        recomputedHash: recomputed,
        headAtDetection: { id: entries[entries.length - 1].id, hash: entries[entries.length - 1].hash },
      },
    };
  }
  if (entries.length) segments.push(seg);
  return {
    valid: true,
    brokenAtId: null,
    head: entries.length ? entries[entries.length - 1].hash : anchor,
    segments,
    acknowledgedBreaks,
    quarantinedIds,
    incident: null,
  };
}

/** Informe de incidente exportable (spec v1.3 §5.5 "Evidencia"). */
export interface LedgerIncidentReport {
  kind: "DT_LEDGER_INCIDENT_REPORT";
  version: 1;
  incident: LedgerIncident | null;
  acknowledgements: LedgerBreakAck[];
  rows: { lastGood: LedgerEntry | null; breakAt: LedgerEntry | null };
  head: { id: number; hash: string } | null;
  entryCount: number;
  appVersion: string;
  /** Advertencia fija: los asientos v1 pueden contener notas en claro (§13). */
  notice: string;
}

type AppendDraft = Omit<LedgerDraft, "payloadJson"> & { data?: unknown };

/** Puerto de redacción de notas (spec v1.3 §13). Por defecto no hay digest. */
let noteDigester: (note: string) => Promise<string | null> = async () => null;

/** Versión del payload de los asientos nuevos (spec v1.3 §13). */
export const LEDGER_PAYLOAD_VERSION = 2;

/**
 * Payload v2 (§13): todo asiento nuevo lleva data.ledgerPayloadVersion = 2 y
 * el campo `note` nunca se escribe; se sustituye por noteDigest (HMAC con
 * clave derivada; null sin digester o sin kid activo). Defensa en
 * profundidad: aunque un llamador pase la nota, aquí se redacta.
 */
async function redactPayloadV2(data: unknown): Promise<Record<string, unknown>> {
  if (data === null || data === undefined) return { ledgerPayloadVersion: LEDGER_PAYLOAD_VERSION };
  if (typeof data !== "object" || Array.isArray(data)) return { value: data, ledgerPayloadVersion: LEDGER_PAYLOAD_VERSION };
  const { note, ...rest } = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...rest, ledgerPayloadVersion: LEDGER_PAYLOAD_VERSION };
  if (note !== undefined && !("noteDigest" in rest)) out.noteDigest = await IntegrityLedgerService.noteDigest(typeof note === "string" ? note : null);
  return out;
}

export const IntegrityLedgerService = {
  /**
   * Añade un asiento. Debe llamarse DENTRO de la transacción de la intención
   * (pasar `database`) para que registro y asiento sean atómicos.
   */
  async append(draft: AppendDraft, database?: SQLite.SQLiteDatabase): Promise<LedgerEntry> {
    const last = await PersistenceService.getLastLedgerEntry(database);
    const prevHash = last?.hash ?? GENESIS_HASH;
    const { data, ...rest } = draft;
    const payloadJson = canonicalJson({ ...rest, data: await redactPayloadV2(data) });
    const hash = await chainHash(prevHash, payloadJson);
    const entry: Omit<LedgerEntry, "id"> = { ...rest, prevHash, hash, payloadJson };
    const id = await PersistenceService.insertLedgerEntry(entry, database);
    return { ...entry, id };
  },

  /** FieldCrypto v1.3 §16: ids de packs con al menos un asiento PACK_SHARED. */
  async sharedPackIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const e of await PersistenceService.listLedger({ intent: "PACK_SHARED" })) {
      try {
        const packId = (JSON.parse(e.payloadJson) as { data?: { packId?: unknown } }).data?.packId;
        if (typeof packId === "string") ids.add(packId);
      } catch {
        // asiento ilegible: no cuenta como compartido
      }
    }
    return [...ids];
  },

  /** Inyección del digester de notas (boot.wirePorts → FieldCryptoService.noteDigest). */
  setNoteDigester(fn: ((note: string) => Promise<string | null>) | null): void {
    noteDigester = fn ?? (async () => null);
  },

  async noteDigest(note: string | null | undefined): Promise<string | null> {
    if (note === null || note === undefined || !String(note).trim()) return null;
    try {
      return await noteDigester(String(note));
    } catch {
      return null;
    }
  },

  async listForSession(sessionId: number): Promise<LedgerEntry[]> {
    return PersistenceService.listLedger({ sessionId });
  },

  async listForPeriod(from: number, to: number): Promise<LedgerEntry[]> {
    return PersistenceService.listLedger({ from, to });
  },

  /**
   * Verifica la cadena completa por segmentos (spec v1.3 §5.5).
   * `valid` = íntegra, o íntegra con todas sus rupturas reconocidas.
   */
  async verify(): Promise<LedgerVerification> {
    return verifySegments(await PersistenceService.listLedger());
  },

  /**
   * Verificación desde KV ledger.verified_through (arranque). La marca no
   * prueba el prefijo: una edición offline del payload anterior deja la cola
   * intacta. Se vuelve a hashear cada asiento hasta el ancla y, si cuadra,
   * solo entonces la cola.
   */
  async verifyIncremental(): Promise<LedgerVerification> {
    const through = await PersistenceService.getKv<{ id: number; hash: string }>(LEDGER_KV.VERIFIED_THROUGH);
    if (!through) return IntegrityLedgerService.verify();
    const prefix = await PersistenceService.listLedger({ toId: through.id });
    const anchor = prefix.find((e) => e.id === through.id);
    if (!anchor || anchor.hash !== through.hash) return IntegrityLedgerService.verify();
    const prefixCheck = await verifySegments(prefix);
    if (!prefixCheck.valid) return prefixCheck;
    const tail = await PersistenceService.listLedger({ afterId: through.id });
    const acked = acksOf(await PersistenceService.listLedger({ intent: "LEDGER_BREAK_ACKNOWLEDGED" })).length;
    const r = await verifySegments(tail, through.hash, { id: anchor.id, hash: anchor.hash });
    return { ...r, head: tail.length ? r.head : through.hash, acknowledgedBreaks: acked };
  },

  /** Marca el punto verificado (solo con cadena válida). */
  async markVerified(): Promise<void> {
    const last = await PersistenceService.getLastLedgerEntry();
    if (last) await PersistenceService.setKv(LEDGER_KV.VERIFIED_THROUGH, { id: last.id, hash: last.hash });
  },

  async getIncident(): Promise<LedgerIncident | null> {
    return PersistenceService.getKv<LedgerIncident>(LEDGER_KV.BROKEN);
  },

  /**
   * Registra el incidente si la verificación encontró una ruptura no
   * reconocida. Si ya existe un incidente para el mismo asiento, lo conserva
   * (detectedAtMs original). Devuelve el incidente vigente o null.
   */
  async recordIncident(v: LedgerVerification, nowMs: number): Promise<LedgerIncident | null> {
    const current = await IntegrityLedgerService.getIncident();
    if (!v.incident) return current;
    if (current && current.breakAtId === v.incident.breakAtId && current.observedHash === v.incident.observedHash) return current;
    const incident: LedgerIncident = { ...v.incident, detectedAtMs: nowMs };
    await PersistenceService.setKv(LEDGER_KV.BROKEN, incident);
    return incident;
  },

  /** SHA-256 canónico del incidente (va en el asiento de reconocimiento). */
  async incidentHash(incident: LedgerIncident): Promise<string> {
    return sha256Hex(canonicalJson(incident));
  },

  /**
   * Reconocimiento (spec v1.3 §5.5): solo si `claimed` coincide EXACTAMENTE
   * con ledger.broken. Asiento con sessionId null, append normal (prev_hash =
   * head actual). La autorización (PIN) la valida la capa de Aplicación.
   */
  async acknowledgeBreak(
    claimed: LedgerIncident,
    nowMs: number,
  ): Promise<{ ok: true; entry: LedgerEntry } | { ok: false; code: "NO_LEDGER_INCIDENT" | "LEDGER_INCIDENT_MISMATCH" }> {
    const current = await IntegrityLedgerService.getIncident();
    if (!current) return { ok: false, code: "NO_LEDGER_INCIDENT" };
    const same = INCIDENT_FIELDS.every((k) => canonicalJson(current[k] ?? null) === canonicalJson(claimed?.[k] ?? null));
    if (!same) return { ok: false, code: "LEDGER_INCIDENT_MISMATCH" };
    const incidentHash = await IntegrityLedgerService.incidentHash(current);
    const entry = await PersistenceService.transaction(async (db) => {
      const head = await PersistenceService.getLastLedgerEntry(db);
      const data: LedgerBreakAck = {
        breakAtId: current.breakAtId,
        lastGoodId: current.lastGoodId,
        lastGoodHash: current.lastGoodHash,
        observedPrevHash: current.observedPrevHash,
        observedHash: current.observedHash,
        recomputedHash: current.recomputedHash,
        headAtAckId: head!.id,
        headAtAckHash: head!.hash,
        incidentHash,
        acknowledgedAtMs: nowMs,
      };
      const e = await IntegrityLedgerService.append(
        {
          sessionId: null,
          actor: "USER",
          intent: "LEDGER_BREAK_ACKNOWLEDGED",
          fromState: null,
          toState: null,
          reason: "ADMIN_ACKNOWLEDGED_BREAK",
          timestampMs: nowMs,
          integrityClass: null,
          data,
        },
        db,
      );
      await db.runAsync(`DELETE FROM app_kv WHERE key = ?`, [LEDGER_KV.BROKEN]);
      return e;
    });
    await IntegrityLedgerService.markVerified();
    return { ok: true, entry };
  },

  /**
   * Instantes (timestamp_ms) de los asientos con id en [breakAtId, headAtAckId]
   * de cada ruptura reconocida: los periodos que los contienen son "tocados"
   * y solo se sellan como no certificados (spec v1.3 §5.5).
   */
  async segmentedTimestamps(): Promise<number[]> {
    const acks = acksOf(await PersistenceService.listLedger({ intent: "LEDGER_BREAK_ACKNOWLEDGED" }));
    if (!acks.length) return [];
    const out: number[] = [];
    for (const a of acks) {
      const rows = await PersistenceService.listLedger({ fromId: a.breakAtId, toId: a.headAtAckId });
      rows.forEach((r) => out.push(r.timestampMs));
    }
    return out;
  },

  /**
   * Informe de incidente (JSON canónico + SHA-256). Determinista para un mismo
   * estado del ledger: dos llamadas sin asientos nuevos dan el mismo hash.
   */
  async buildIncidentReport(appVersion: string): Promise<{ report: LedgerIncidentReport; json: string; sha256: string }> {
    const incident = await IntegrityLedgerService.getIncident();
    const all = await PersistenceService.listLedger();
    const acks = acksOf(all).map(({ ackId: _a, ...rest }) => rest);
    const ref = incident ?? acks[acks.length - 1] ?? null;
    const byId = (id: number | null | undefined) => (id === null || id === undefined ? null : all.find((e) => e.id === id) ?? null);
    const last = all[all.length - 1];
    const report: LedgerIncidentReport = {
      kind: "DT_LEDGER_INCIDENT_REPORT",
      version: 1,
      incident,
      acknowledgements: acks,
      rows: { lastGood: byId(ref?.lastGoodId), breakAt: byId(ref?.breakAtId) },
      head: last ? { id: last.id, hash: last.hash } : null,
      entryCount: all.length,
      appVersion,
      notice: "Los asientos con ledgerPayloadVersion ausente (v1) pueden contener notas en claro.",
    };
    const json = canonicalJson(report);
    return { report, json, sha256: await sha256Hex(json) };
  },

  /**
   * Resumen de evidencia del periodo para EvidencePack. `traces` lo aporta
   * TraceRecorderService (capa Evidencia).
   */
  async summarize(
    sessions: SessionRecord[],
    from: number,
    to: number,
    traces: EvidenceSummary["traces"],
  ): Promise<EvidenceSummary> {
    const ids = new Set(sessions.map((s) => s.id));
    // La ventana del periodo no alcanza: una jornada que cruza la semana tiene
    // asientos del lado de allá (entrada el domingo, cierre el lunes). Esos
    // asientos son de las sesiones incluidas y entran al expediente.
    const inWindow = await PersistenceService.listLedger({ from, to });
    const extras = (await Promise.all([...ids].map((id) => PersistenceService.listLedger({ sessionId: id })))).flat();
    const byId = new Map<number, (typeof inWindow)[number]>();
    for (const e of [...inWindow, ...extras]) {
      if (e.sessionId !== null && !ids.has(e.sessionId)) continue;
      byId.set(e.id, e);
    }
    const entries = [...byId.values()].sort((a, b) => a.id - b.id);
    const chain = await IntegrityLedgerService.verify();
    return {
      ledgerEntryCount: entries.length,
      ledgerHeadHash: chain.head,
      ledgerChainValid: chain.valid,
      ledgerHashes: entries.map((e) => ({ id: e.id, sessionId: e.sessionId, hash: e.hash })),
      traces,
      conflicts: sessions
        .filter((s) => s.integrityClass === "CONFLICT")
        .map((s) => ({ sessionId: s.id, reason: s.bookkeeping.integrityReason })),
    };
  },
};
