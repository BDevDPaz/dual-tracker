import { useCallback, useEffect, useState } from "react";
import { permissionsHealthService } from "../../../services/PermissionsHealthService";
import { timeAuthorityService } from "../../../services/TimeAuthorityService";
import { taskOrchestratorService } from "../../../services/TaskOrchestratorService";
import type { PermissionsHealthResult } from "../../../services/PermissionsHealthService";
import type { ClockDriftResult } from "../../../services/TimeAuthorityService";
import type { BackgroundTaskDescriptor } from "../../../services/TaskOrchestratorService";

/**
 * useSystemHealth — sensores reales de app/system/health.tsx. Sustituye el
 * simulador "GPS revocado" de las maquetas: cada valor viene de una lectura
 * en vivo del sistema operativo (Propuesta capa app §5.15).
 */
export function useSystemHealth() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<PermissionsHealthResult | null>(null);
  const [drift, setDrift] = useState<ClockDriftResult | null>(null);
  const [tasks, setTasks] = useState<BackgroundTaskDescriptor[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult] = await Promise.all([permissionsHealthService.checkHealth()]);
      setHealth(healthResult);
      setDrift(timeAuthorityService.checkDrift());
      setTasks(taskOrchestratorService.listInventory());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, health, drift, tasks, refresh };
}
