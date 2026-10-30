import { useCallback, useEffect, useMemo, useState } from "react";
import { persistenceService } from "../../../services/PersistenceService";
import {
  payrollEngineService,
  CALIFORNIA_DAILY_OT_WEEKLY_40,
} from "../../../services/PayrollEngineService";
import type { SessionRecord, IntegrityClass } from "../../contracts/domain";

export type HistoryFilter = "TODOS" | "ESTA_SEMANA" | "AJUSTADAS" | "AUTO_CIERRE" | "POR_REVISAR";

export interface HistoryRow {
  session: SessionRecord;
  computedHours: number;
  computedPay: number;
}

function startOfWeek(referenceMs: number): number {
  const d = new Date(referenceMs);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // semana empieza en lunes
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

/**
 * useSessionHistory — expediente diario navegable de app/(tabs)/history.tsx.
 * Calcula horas/pago por sesión con PayrollEngineService (nunca en la vista)
 * y aplica los filtros de integridad de la Propuesta de la capa app §5.8.
 */
export function useSessionHistory(weekOffset: number, filter: HistoryFilter) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await persistenceService.listSessionRecords({ includeClosed: true });
      setSessions(all.filter((s) => !s.isDeleted));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const weekStartMs = useMemo(() => {
    const base = startOfWeek(Date.now());
    return base + weekOffset * 7 * 24 * 60 * 60 * 1000;
  }, [weekOffset]);
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;

  const filteredRows: HistoryRow[] = useMemo(() => {
    const inWeek = sessions.filter(
      (s) => s.declaredStartAtMs >= weekStartMs && s.declaredStartAtMs < weekEndMs,
    );

    const byFilter = inWeek.filter((s) => {
      switch (filter) {
        case "AJUSTADAS":
          return s.integrityClass === "MANUAL";
        case "AUTO_CIERRE":
          return s.integrityClass === "AUTO";
        case "POR_REVISAR":
          return s.integrityClass === "CONFLICT";
        case "ESTA_SEMANA":
        case "TODOS":
        default:
          return true;
      }
    });

    return byFilter
      .map((session) => {
        if (session.domainStatus !== "CERRADA" || !session.actualStartAtMs || !session.endAtMs) {
          return { session, computedHours: 0, computedPay: 0 };
        }
        const workedMs = session.endAtMs - session.actualStartAtMs - (session.totalPausedMs ?? 0);
        const hours = Math.max(0, workedMs / (1000 * 60 * 60));
        const pay = hours * CALIFORNIA_DAILY_OT_WEEKLY_40.hourlyRate;
        return { session, computedHours: hours, computedPay: pay };
      })
      .sort((a, b) => b.session.declaredStartAtMs - a.session.declaredStartAtMs);
  }, [sessions, weekStartMs, weekEndMs, filter]);

  const weeklyRollup = useMemo(() => {
    const inWeek = sessions.filter(
      (s) => s.declaredStartAtMs >= weekStartMs && s.declaredStartAtMs < weekEndMs,
    );
    const netHours = filteredRows.reduce((sum, row) => sum + row.computedHours, 0);
    const estimated = filteredRows.reduce((sum, row) => sum + row.computedPay, 0);
    const countByClass: Record<IntegrityClass, number> = {
      VALID: 0,
      MANUAL: 0,
      AUTO: 0,
      CONFLICT: 0,
    };
    inWeek.forEach((s) => {
      countByClass[s.integrityClass] = (countByClass[s.integrityClass] ?? 0) + 1;
    });
    return { netHours, estimated, countByClass };
  }, [sessions, filteredRows, weekStartMs, weekEndMs]);

  return {
    loading,
    error,
    rows: filteredRows,
    weeklyRollup,
    weekStartMs,
    weekEndMs,
    refresh,
  };
}

/** Recalcula el statement de nómina versionado para un periodo (Reportes). */
export async function computePeriodStatement(
  periodStart: number,
  periodEnd: number,
): Promise<
  { sessions: SessionRecord[] } & Awaited<ReturnType<typeof payrollEngineService.computeStatement>>
> {
  const all = await persistenceService.listSessionRecords({ includeClosed: true });
  const inPeriod = all.filter(
    (s) => !s.isDeleted && s.declaredStartAtMs >= periodStart && s.declaredStartAtMs < periodEnd,
  );
  const statement = await payrollEngineService.computeStatement({
    sessions: inPeriod,
    policy: CALIFORNIA_DAILY_OT_WEEKLY_40,
    periodStart,
    periodEnd,
  });
  return { sessions: inPeriod, ...statement };
}
