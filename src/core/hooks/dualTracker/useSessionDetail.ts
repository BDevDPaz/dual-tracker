import { useCallback, useEffect, useState } from "react";
import { sessionEngineService } from "../../../services/SessionEngineService";
import { persistenceService } from "../../../services/PersistenceService";
import { siteRegistryService } from "../../../services/SiteRegistryService";
import type { ManualPatchInput } from "../../../services/SessionEngineService";
import type { LedgerEntry, SessionRecord, Site } from "../../contracts/domain";

/**
 * useSessionDetail — expediente de una jornada (app/session/[id].tsx):
 * la sesión, el sitio asociado y el timeline real del ledger.
 */
export function useSessionDetail(sessionId: number | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [traceCount, setTraceCount] = useState(0);

  const refresh = useCallback(async () => {
    if (sessionId === null) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [found, entries, facts] = await Promise.all([
        persistenceService.getSessionRecord(sessionId),
        persistenceService.listLedgerEntriesForSession(sessionId),
        persistenceService.listSpatialFacts(sessionId),
      ]);
      setSession(found);
      setLedgerEntries(entries);
      setTraceCount(facts.length);
      setSite(found?.siteId ? await siteRegistryService.getSite(found.siteId) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = useCallback(
    async (input: ManualPatchInput) => {
      if (sessionId === null) return;
      await sessionEngineService.manualPatch(sessionId, input);
      await refresh();
    },
    [sessionId, refresh],
  );

  const remove = useCallback(async () => {
    if (sessionId === null || !session) return;
    // Borrado lógico (isDeleted), nunca DROP -- Propuesta capa app §5.9.
    await persistenceService.saveSessionRecord({ ...session, isDeleted: true });
    await refresh();
  }, [sessionId, session, refresh]);

  return { loading, error, session, site, ledgerEntries, traceCount, refresh, patch, remove };
}
