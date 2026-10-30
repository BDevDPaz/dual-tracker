import { useCallback, useEffect, useState } from "react";
import { persistenceService } from "../../../services/PersistenceService";
import type { SpatialFact } from "../../contracts/domain";

/**
 * useSessionTrace — solo lectura del rastro de una sesión
 * (app/session/[id]/trace.tsx). Nunca escribe: TraceRecorderService es
 * quien graba, en segundo plano, mientras la jornada está ACTIVA/TRASLADO.
 */
export function useSessionTrace(sessionId: number | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<SpatialFact[]>([]);

  const refresh = useCallback(async () => {
    if (sessionId === null) {
      setFacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await persistenceService.listSpatialFacts(sessionId);
      setFacts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const perimeterFacts = facts.filter(
    (f) => f.type === "ENTER" || f.type === "EXIT" || f.type === "DWELL",
  );
  const breadcrumbFacts = facts.filter((f) => f.type === "BREADCRUMB");

  return { loading, error, facts, perimeterFacts, breadcrumbFacts, refresh };
}
