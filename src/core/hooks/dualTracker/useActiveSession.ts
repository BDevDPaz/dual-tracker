import { useCallback, useEffect, useState } from "react";
import { sessionEngineService } from "../../../services/SessionEngineService";
import { persistenceService } from "../../../services/PersistenceService";
import { permissionsHealthService } from "../../../services/PermissionsHealthService";
import { siteRegistryService } from "../../../services/SiteRegistryService";
import { taskOrchestratorService } from "../../../services/TaskOrchestratorService";
import { feedbackService } from "../../../services/FeedbackService";
import { workTrackerEngine } from "../../../core/workTrackerEngine";
import type { PermissionsHealthResult } from "../../../services/PermissionsHealthService";
import type { ManualPatchInput } from "../../../services/SessionEngineService";
import type { Site, SessionRecord } from "../../contracts/domain";
import { toEngineState, domainStatusLabel } from "./uiMappings";
import type { EngineState } from "../../../components/ui/OperationalHeroCard";

/**
 * ============================================================================
 * useActiveSession — único punto de lectura/escritura de la jornada del día
 * para app/(tabs)/index.tsx ("Hoy").
 * ----------------------------------------------------------------------------
 * Satisface la regla de frontera de la Propuesta de la capa app: ninguna
 * pantalla importa SessionEngineService/PersistenceService directamente;
 * todas pasan por este hook (o por sus hermanos en src/core/hooks/dualTracker).
 * ============================================================================
 */

export interface UseActiveSessionResult {
  loading: boolean;
  error: string | null;
  session: SessionRecord | null;
  engineState: EngineState;
  statusLabel: string;
  health: PermissionsHealthResult | null;
  destinationSites: Site[];
  refresh: () => Promise<void>;
  startDay: (input: { siteId: string | null; clientId: string | null }) => Promise<void>;
  confirmArrival: () => Promise<void>;
  startLunch: () => Promise<void>;
  endLunch: (deductedMinutes: number) => Promise<void>;
  startTransit: (toSiteId: string) => Promise<void>;
  resolveExitContinue: () => Promise<void>;
  closeDay: () => Promise<void>;
  manualPatch: (patch: ManualPatchInput) => Promise<void>;
}

export function useActiveSession(): UseActiveSessionResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [health, setHealth] = useState<PermissionsHealthResult | null>(null);
  const [destinationSites, setDestinationSites] = useState<Site[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [openSessions, healthResult, sites] = await Promise.all([
        persistenceService.listSessionRecords({ includeClosed: false }),
        permissionsHealthService.checkHealth(),
        siteRegistryService.listSites(true),
      ]);

      const active = openSessions.length > 0 ? openSessions[0] : null;
      setSession(active);
      setHealth(healthResult);
      setDestinationSites(sites);

      if (active) {
        await taskOrchestratorService.beat(active.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withRefresh = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await refresh();
      } catch (err) {
        // CORREGIDO 2026-10-29: emit() solo construía el payload y se perdía.
        // Ahora se despacha a workTrackerEngine para que useLogFeedback lo muestre vía Toast.
        const payload = feedbackService.emit("MUTEX_REJECTED", "error");
        workTrackerEngine.dispatch({ type: "FEEDBACK_ENQUEUED", feedback: payload } as any);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refresh],
  );

  const startDay = useCallback(
    (input: { siteId: string | null; clientId: string | null }) =>
      withRefresh(() => sessionEngineService.startDay(input)),
    [withRefresh],
  );

  const confirmArrival = useCallback(
    () =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        return sessionEngineService.confirmArrival(session.id, Date.now(), "USER");
      }),
    [withRefresh, session],
  );

  const startLunch = useCallback(
    () =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        return sessionEngineService.startLunch(session.id);
      }),
    [withRefresh, session],
  );

  const endLunch = useCallback(
    (deductedMinutes: number) =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        return sessionEngineService.endLunch(session.id, deductedMinutes);
      }),
    [withRefresh, session],
  );

  const startTransit = useCallback(
    (toSiteId: string) =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        return sessionEngineService.startTransit(session.id, toSiteId);
      }),
    [withRefresh, session],
  );

  const resolveExitContinue = useCallback(
    () =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        return sessionEngineService.resolveExitContinue(session.id);
      }),
    [withRefresh, session],
  );

  const closeDay = useCallback(
    () =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        const degraded = health?.degraded ?? false;
        return sessionEngineService.closeDay(
          session.id,
          Date.now(),
          "USER",
          degraded ? "CONFLICT" : "VALID",
          degraded ? "PERMISSION_REVOKED" : null,
        );
      }),
    [withRefresh, session, health],
  );

  const manualPatch = useCallback(
    (patch: ManualPatchInput) =>
      withRefresh(() => {
        if (!session) return Promise.resolve();
        return sessionEngineService.manualPatch(session.id, patch);
      }),
    [withRefresh, session],
  );

  return {
    loading,
    error,
    session,
    engineState: toEngineState(session?.domainStatus ?? null),
    statusLabel: session ? domainStatusLabel(session.domainStatus) : "Sin iniciar",
    health,
    destinationSites,
    refresh,
    startDay,
    confirmArrival,
    startLunch,
    endLunch,
    startTransit,
    resolveExitContinue,
    closeDay,
    manualPatch,
  };
}
