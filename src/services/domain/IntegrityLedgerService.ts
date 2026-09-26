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
import type { EvidenceSummary, LedgerDraft, LedgerEntry, SessionRecord } from "../../core/contracts";
import { GENESIS_HASH } from "../../core/contracts";
import { canonicalJson } from "../../utils/canonicalJson";
import { chainHash, verifyChain } from "../evidence/HashChain";
import { PersistenceService } from "../persistence/PersistenceService";

export const IntegrityLedgerService = {
  /**
   * Añade un asiento. Debe llamarse DENTRO de la transacción de la intención
   * (pasar `database`) para que registro y asiento sean atómicos.
   */
  async append(
    draft: Omit<LedgerDraft, "payloadJson"> & { data?: unknown },
    database?: SQLite.SQLiteDatabase,
  ): Promise<LedgerEntry> {
    const last = await PersistenceService.getLastLedgerEntry(database);
    const prevHash = last?.hash ?? GENESIS_HASH;
    const { data, ...rest } = draft;
    const payloadJson = canonicalJson({ ...rest, data: data ?? null });
    const hash = await chainHash(prevHash, payloadJson);
    const entry: Omit<LedgerEntry, "id"> = { ...rest, prevHash, hash, payloadJson };
    const id = await PersistenceService.insertLedgerEntry(entry, database);
    return { ...entry, id };
  },

  async listForSession(sessionId: number): Promise<LedgerEntry[]> {
    return PersistenceService.listLedger({ sessionId });
  },

  async listForPeriod(from: number, to: number): Promise<LedgerEntry[]> {
    return PersistenceService.listLedger({ from, to });
  },

  /** Verifica la cadena completa. -1 = íntegra; si no, id del primer asiento roto. */
  async verify(): Promise<{ valid: boolean; brokenAtId: number | null; head: string }> {
    const all = await PersistenceService.listLedger();
    const idx = await verifyChain(all);
    return {
      valid: idx === -1,
      brokenAtId: idx === -1 ? null : all[idx].id,
      head: all.length ? all[all.length - 1].hash : GENESIS_HASH,
    };
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
    const entries = (await PersistenceService.listLedger({ from, to })).filter(
      (e) => e.sessionId === null || ids.has(e.sessionId),
    );
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
