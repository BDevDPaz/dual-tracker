import { useCallback, useEffect, useState } from "react";
import { persistenceService } from "../../../services/PersistenceService";
import { sessionEngineService } from "../../../services/SessionEngineService";
import type {
  ConflictResolution,
  ResolveConflictInput,
} from "../../../services/SessionEngineService";
import type { SessionRecord, LedgerEntry } from "../../contracts/domain";

/**
 * useConflictResolution — app/system/conflict.tsx. Encuentra las jornadas en
 * clase CONFLICT y expone las tres decisiones formales de la Propuesta capa
 * app §5.16 (conservar GPS, aceptar manual, dividir), cada una como una
 * intención + un asiento nuevo del ledger vía SessionEngineService.
 */
export function useConflictResolution(sessionId: number | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);

  const refresh = useCallback(async () => {
    if (sessionId === null) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [found, entries] = await Promise.all([
        persistenceService.getSessionRecord(sessionId),
        persistenceService.listLedgerEntriesForSession(sessionId),
      ]);
      setSession(found);
      setLedgerEntries(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolve = useCallback(
    async (resolution: ConflictResolution, note: string, extra?: Partial<ResolveConflictInput>) => {
      if (sessionId === null) return null;
      const result = await sessionEngineService.resolveConflict(sessionId, {
        resolution,
        note,
        ...extra,
      });
      await refresh();
      return result;
    },
    [sessionId, refresh],
  );

  return { loading, error, session, ledgerEntries, refresh, resolve };
}

/** Lista todas las sesiones abiertas con clase CONFLICT, para un banner global. */
export async function listConflictedSessions(): Promise<SessionRecord[]> {
  const all = await persistenceService.listSessionRecords({ includeClosed: true });
  return all.filter((s) => s.integrityClass === "CONFLICT" && !s.isDeleted);
}
