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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeDataRevision, type DataScope } from "../refresh/dataRevision";
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
import { previewPayroll, previewPayrollRange } from "../../services/application/useCases";
import { OfflineQueueService } from "../../services/persistence/OfflineQueueService";
import { DualDisclosureService } from "../../services/domain/DualDisclosureService";
import { IntegrityLedgerService } from "../../services/domain/IntegrityLedgerService";
import { PayrollEngineService } from "../../services/domain/PayrollEngineService";
import { PAYROLL_POLICIES, getPayrollPolicy } from "../../services/domain/payrollPolicies";
import { EvidencePackService } from "../../services/evidence/EvidencePackService";
import { TimeAuthorityService } from "../../services/evidence/TimeAuthorityService";
import { TraceRecorderService } from "../../services/evidence/TraceRecorderService";
import { classifyBreadcrumbGaps } from "../../services/evidence/traceGaps";
import { FeedbackService } from "../../services/application/FeedbackService";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { employerKeyAnchorConfigured } from "../../config/employerKeyAnchor";
import { decodeProvisionCode } from "../../services/runtime/pinProvision";
import { fingerprintFromB64url, fingerprintsMatch } from "../../services/runtime/keyFingerprint";
import { SecurityService } from "../../services/runtime/SecurityService";
import { useLanguage } from "../../i18n";
import { companyCalendar } from "../../utils/companyPolicy";
import { segmentInterval } from "../../services/domain/segmentation";
import { getWeekEnd } from "../../utils/dateUtils";

const queries = {
  loadSessionLedger: (sessionId: number): Promise<LedgerEntry[]> => IntegrityLedgerService.listForSession(sessionId),
  loadTrace: (sessionId: number): Promise<SpatialFact[]> => TraceRecorderService.listForSession(sessionId),
  /** Huecos de la miga ya descifrada. No sale del teléfono. */
  traceGaps: (facts: SpatialFact[]) => {
    const state = Store.getState();
    const packs = Object.values(state.packs.byId).map((p) => ({
      periodStart: p.manifest.periodStart,
      periodEnd: p.manifest.periodEnd,
    }));
    const crumbs = facts.filter((f) => f.type === "BREADCRUMB").map((f) => ({ timestampMs: f.timestampMs }));
    return classifyBreadcrumbGaps(crumbs, packs, TimeAuthorityService.now(), state.settings.company.traceRetentionDays);
  },
  traceDistanceMeters: (facts: SpatialFact[]): number => TraceRecorderService.distanceMeters(facts),
  previewPeriod: (periodStart: number, periodEnd: number): Promise<PayrollStatement> => previewPayroll(periodStart, periodEnd),
  previewRange: (periodStart: number, periodEnd: number) => previewPayrollRange(periodStart, periodEnd),
  listOfflineQueue: () => OfflineQueueService.list(),
  sealFreshness: (periodStart: number, periodEnd: number) => EvidencePackService.describeFreshness(periodStart, periodEnd),
  /**
   * Líneas de una sesión en cada semana que toca. Una jornada que cruza el
   * domingo no se queda solo con la semana de entrada.
   */
  sessionLines: async (session: SessionRecord): Promise<PayrollLine[]> => {
    const state = Store.getState();
    const start = session.actualStartAtMs ?? session.declaredStartAtMs;
    const history = companyCalendar(state.settings.company);
    const end = session.endAtMs ?? TimeAuthorityService.now();
    const weekStarts = [...new Set(segmentInterval(start, end, history).map((seg) => seg.weekStartMs))].sort((a, b) => a - b);
    const lines: PayrollLine[] = [];
    for (const periodStart of weekStarts) {
      const periodEnd = getWeekEnd(periodStart, history);
      const week = await PersistenceService.listSessions({ from: periodStart, to: periodEnd, overlapping: true });
      const policyId = (await PersistenceService.packPolicyForPeriod(periodStart, periodEnd)) ?? state.settings.company.overtimePolicyId;
      lines.push(
        ...PayrollEngineService.linesForSession(session.id, week, {
          rates: { hourlyRate: state.settings.profile.hourlyRate, overtimeMultiplier: state.settings.company.overtimeMultiplier },
          company: state.settings.company,
          policyId,
          nowMs: TimeAuthorityService.now(),
          periodStart,
          periodEnd,
        }),
      );
    }
    return lines;
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
  /**
   * Vista previa del código de PIN para Ajustes. La pantalla no importa
   * servicios: aquí se decide si hay que teclear la huella y si lo tecleado
   * coincide. La fijación sigue en PROVISION_ADMIN_PIN.
   */
  previewEmployerCode: async (code: string, typedFingerprint: string) => {
    const decoded = decodeProvisionCode(code.trim());
    const fingerprint = decoded ? fingerprintFromB64url(decoded.pub) : null;
    const pinned = await SecurityService.hasPinnedEmployerKey();
    const needsFingerprint = !pinned && !employerKeyAnchorConfigured() && !!fingerprint;
    const confirmed = !needsFingerprint || (!!fingerprint && fingerprintsMatch(typedFingerprint, fingerprint));
    return { fingerprint, needsFingerprint, confirmed };
  },
};

export type WorkTrackerQueries = typeof queries;

export function useWorkTracker(): {
  state: DualTrackerState;
  emit: (intent: ViewIntent) => Promise<IntentResult<unknown>>;
  now: () => number;
  queries: WorkTrackerQueries;
} {
  useLanguage();
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

/**
 * Carga asíncrona (loading / error / data).
 * `scopes` limita la rehidratación automática: un BREADCRUMB (trace) no
 * vuelve a pedir la nómina. Sin scopes, cualquier revisión recarga.
 * La primera carga muestra loading. Cambiar el primer dep (id de sesión
 * o inicio de periodo) vacía el dato. Una revisión de fondo, o un dep
 * secundario (updatedAt, sesiones), conserva lo pintado y no hace
 * setState tras unmount.
 */
export function useQuery<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  scopes?: readonly DataScope[],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const soft = useRef(false);
  const hard = useRef(false);
  const seen = useRef(false);
  const idRef = useRef(deps[0]);
  const idChanged = useRef(false);
  const marker = useRef<{ deps: unknown[]; changed: boolean }>({ deps, changed: false });
  if (!Object.is(idRef.current, deps[0])) {
    idRef.current = deps[0];
    idChanged.current = true;
  }
  if (marker.current.deps.length !== deps.length || marker.current.deps.some((d, i) => !Object.is(d, deps[i]))) {
    marker.current = { deps, changed: true };
  }
  const scopeKey = scopes ? [...scopes].sort().join(",") : "*";

  useEffect(() => {
    return subscribeDataRevision((_rev, changed) => {
      if (scopeKey !== "*" && !changed.some((s) => scopeKey.split(",").includes(s))) return;
      soft.current = true;
      setTick((x) => x + 1);
    });
  }, [scopeKey]);

  useEffect(() => {
    let alive = true;
    const depsChanged = marker.current.changed;
    const identityChanged = idChanged.current;
    const force = hard.current;
    marker.current.changed = false;
    idChanged.current = false;
    hard.current = false;
    // Revisión o cambio de deps secundarias (updatedAt, sesiones): conservar
    // lo ya pintado. Cambiar de sesión/periodo sí vacía, para no mostrar
    // el ledger de otra jornada.
    const background = seen.current && !identityChanged && !force && (soft.current || depsChanged);
    soft.current = false;
    if (identityChanged) setData(null);
    if (!background) setLoading(true);
    loader()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (!alive) return;
        seen.current = true;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return {
    data,
    loading,
    error,
    reload: () => {
      hard.current = true;
      setTick((x) => x + 1);
    },
  };
}
