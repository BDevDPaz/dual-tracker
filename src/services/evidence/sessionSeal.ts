/**
 * Sello forense de una jornada. Al pasar a CERRADA se añade SESSION_SEALED
 * con sessionHash = SHA-256 de los hashes de los asientos de esa jornada,
 * en orden de id, sin el propio sello. No cambia horas ni clase.
 */
import type * as SQLite from "expo-sqlite";
import type { LedgerHashExport, SessionRecord, SessionSealExport } from "../../core/contracts";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { PersistenceService } from "../persistence/PersistenceService";
import { sessionEventHash } from "./HashChain";

export const SESSION_SEAL_INTENT = "SESSION_SEALED";

function payloadOf(payloadJson: string | undefined): { intent?: string; data?: { sessionHash?: unknown } } | null {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as { intent?: string; data?: { sessionHash?: unknown } };
  } catch {
    return null;
  }
}

/** Hash declarado en un asiento, o null si no es SESSION_SEALED. Cadena vacía si el sello no trae hash. */
export function sessionHashFromPayload(payloadJson: string | undefined): string | null {
  const body = payloadOf(payloadJson);
  if (!body || body.intent !== SESSION_SEAL_INTENT) return null;
  return typeof body.data?.sessionHash === "string" ? body.data.sessionHash : "";
}

export async function appendSessionSeal(db: SQLite.SQLiteDatabase, session: SessionRecord, nowMs: number): Promise<string> {
  const rows = await PersistenceService.listLedger({ sessionId: session.id }, db);
  const hashes = rows
    .filter((entry) => entry.intent !== SESSION_SEAL_INTENT)
    .sort((a, b) => a.id - b.id)
    .map((entry) => entry.hash);
  const sessionHash = await sessionEventHash(hashes);
  await IntegrityLedgerService.append(
    {
      sessionId: session.id,
      actor: "SYSTEM",
      intent: SESSION_SEAL_INTENT,
      fromState: session.domainStatus,
      toState: session.domainStatus,
      reason: SESSION_SEAL_INTENT,
      timestampMs: nowMs,
      integrityClass: session.integrityClass,
      data: { sessionHash, eventCount: hashes.length },
    },
    db,
  );
  return sessionHash;
}

export function sessionSealsFromExport(rows: LedgerHashExport[], sessionIds: ReadonlySet<number>): SessionSealExport[] {
  const seals: SessionSealExport[] = [];
  for (const row of rows) {
    if (row.sessionId == null || !sessionIds.has(row.sessionId)) continue;
    const sessionHash = sessionHashFromPayload(row.payloadJson);
    if (sessionHash === null || !sessionHash) continue;
    seals.push({ sessionId: row.sessionId, sessionHash, entryId: row.id });
  }
  return seals.sort((a, b) => a.entryId - b.entryId);
}

/**
 * Recomputa cada sello a partir de los eslabones exportados. Los packs
 * anteriores no traen SESSION_SEALED: no fallan. Un sello que no cuadra
 * devuelve SESSION_HASH. No exige sello en jornadas cerradas antes de esta
 * versión. Un sello de otra jornada que cae en medio del tramo exportado se
 * recomputa, pero no tiene que estar en la lista del periodo.
 */
export async function sessionSealFailure(
  rows: LedgerHashExport[],
  seals: SessionSealExport[] | undefined,
  sessionIds?: readonly number[],
): Promise<"SESSION_HASH" | null> {
  const sealRows = rows
    .filter((row) => sessionHashFromPayload(row.payloadJson) !== null)
    .sort((a, b) => a.id - b.id);
  for (const row of sealRows) {
    const declared = sessionHashFromPayload(row.payloadJson);
    if (!declared) return "SESSION_HASH";
    const prior = rows
      .filter((item) => item.sessionId === row.sessionId && item.id < row.id && sessionHashFromPayload(item.payloadJson) === null)
      .sort((a, b) => a.id - b.id);
    const hash = await sessionEventHash(prior.map((item) => item.hash));
    if (hash !== declared) return "SESSION_HASH";
  }
  if (seals === undefined) return null;
  const inPeriod = sessionIds ? new Set(sessionIds) : null;
  const relevant = inPeriod ? sealRows.filter((row) => row.sessionId != null && inPeriod.has(row.sessionId)) : sealRows;
  if (seals.length !== relevant.length) return "SESSION_HASH";
  for (const seal of seals) {
    const row = relevant.find((item) => item.id === seal.entryId && item.sessionId === seal.sessionId);
    if (!row || sessionHashFromPayload(row.payloadJson) !== seal.sessionHash) return "SESSION_HASH";
  }
  return null;
}
