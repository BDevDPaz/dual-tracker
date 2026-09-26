/**
 * useWorkTracker — ÚNICO gancho que las rutas pueden usar para leer estado y
 * emitir intenciones (Propuesta de Producto §2).
 * ============================================================================
 * Portado de GEOTrack (src/core/hooks/useWorkTracker.ts): suscripción
 * reactiva real (sin polling) al store. Cambia `dispatch(DomainEvent)` por
 * `emit(ViewIntent)`: la vista expresa intención; decide el dominio.
 *
 * `queries` expone lecturas que no viven en el store (ledger de una sesión,
 * rastro, estado de nómina de un periodo, solape real para EditSessionModal).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DualTrackerState,
  EvidencePack,
  IntentResult,
  LedgerEntry,
  PayrollLine,
  PayrollPolicy,
  PayrollStatement,
  SessionRecord,
  SpatialFact,
  ViewIntent,
} from "../contracts";
import { Store } from "../store";
import { routeIntent } from "../../services/application/intentRouter";
import { previewPayroll } from "../../services/application/useCases";
import { DualDisclosureService } from "../../services/domain/DualDisclosureService";
import { IntegrityLedgerService } from "../../services/domain/IntegrityLedgerService";
import { PayrollEngineService } from "../../services/domain/PayrollEngineService";
import { PAYROLL_POLICIES, getPayrollPolicy } from "../../services/domain/payrollPolicies";
import { EvidencePackService } from "../../services/evidence/EvidencePackService";
import { TimeAuthorityService } from "../../services/evidence/TimeAuthorityService";
import { TraceRecorderService } from "../../services/evidence/TraceRecorderService";
import { FeedbackService } from "../../services/application/FeedbackService";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { getWeekEnd, getWeekStart } from "../../utils/dateUtils";

const queries = {
  loadSessionLedger: (sessionId: number): Promise<LedgerEntry[]> => IntegrityLedgerService.listForSession(sessionId),
  loadTrace: (sessionId: number): Promise<SpatialFact[]> => TraceRecorderService.listForSession(sessionId),
  traceDistanceMeters: (facts: SpatialFact[]): number => TraceRecorderService.distanceMeters(facts),
  previewPeriod: (periodStart: number, periodEnd: number): Promise<PayrollStatement> => previewPayroll(periodStart, periodEnd),
  /** Líneas de una sesión dentro de su semana (session/[id]). */
  sessionLines: async (session: SessionRecord): Promise<PayrollLine[]> => {
    const state = Store.getState();
    const start = session.actualStartAtMs ?? session.declaredStartAtMs;
    const periodStart = getWeekStart(start);
    const periodEnd = getWeekEnd(start);
    const week = await PersistenceService.listSessions({ from: periodStart, to: periodEnd });
    return PayrollEngineService.linesForSession(session.id, week, {
      rates: { hourlyRate: state.settings.profile.hourlyRate, overtimeMultiplier: state.settings.company.overtimeMultiplier },
      company: state.settings.company,
      policyId: state.settings.company.overtimePolicyId,
      nowMs: TimeAuthorityService.now(),
      periodStart,
      periodEnd,
    });
  },
  /** Solape REAL (EditSessionModal) — sustituye la regla demo "00:00" de W Tracker. */
  checkOverlap: (startMs: number, endMs: number | null, excludeId: number | null): Promise<boolean> =>
    PersistenceService.checkOverlap(startMs, endMs, excludeId),
  loadPack: (packId: string): Promise<EvidencePack | null> => EvidencePackService.get(packId),
  packSessions: (pack: EvidencePack): Promise<SessionRecord[]> => EvidencePackService.sessionsOf(pack),
  disclosure: (language: "es" | "en") => DualDisclosureService.getContent(language),
  retention: (language: "es" | "en", days: number) => DualDisclosureService.getRetention(language, days),
  disclosureVersion: (): string => DualDisclosureService.currentVersion(),
  renderFeedback: FeedbackService.render,
  /** Catálogo de políticas de horas extra (zona admin de Ajustes). */
  payrollPolicies: (): PayrollPolicy[] => Object.values(PAYROLL_POLICIES),
  payrollPolicy: (id: string): PayrollPolicy => getPayrollPolicy(id),
};

export type WorkTrackerQueries = typeof queries;

export function useWorkTracker(): {
  state: DualTrackerState;
  emit: (intent: ViewIntent) => Promise<IntentResult<unknown>>;
  now: () => number;
  queries: WorkTrackerQueries;
} {
  const [state, setState] = useState<DualTrackerState>(Store.getState());

  useEffect(() => {
    const unsubscribe = Store.subscribe(setState);
    // Sincronización por si cambió entre el primer render y el effect (GEOTrack).
    const current = Store.getState();
    setState((prev) => (prev !== current ? current : prev));
    return unsubscribe;
  }, []);

  const emit = useCallback((intent: ViewIntent) => routeIntent(intent), []);
  const now = useCallback(() => TimeAuthorityService.now(), []);

  return useMemo(() => ({ state, emit, now, queries }), [state, emit, now]);
}

/** Reloj de UI que re-renderiza cada `intervalMs` (temporizador del hero). */
export function useClock(intervalMs = 1000, enabled = true): number {
  const [nowMs, setNowMs] = useState(() => TimeAuthorityService.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNowMs(TimeAuthorityService.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return nowMs;
}

/** Carga asíncrona simple para queries (estado loading / error / data). */
export function useQuery<T>(loader: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: unknown) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((x) => x + 1) };
}
