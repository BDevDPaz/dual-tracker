/**
 * SessionEngineService — Dominio (Propuesta Técnica §4.1, crítico)
 * ============================================================================
 * Autoridad única del ciclo de vida de la jornada. Recibe INTENCIONES (no
 * mutaciones directas) y devuelve el estado nuevo, el asiento del ledger y el
 * efecto de nómina tentativo.
 *
 *   dispatch(intent, origin)
 *     1. ConcurrencyGuard: candado "session" (rechazo explícito MUTEX_BUSY).
 *     2. Carga sesión abierta / objetivo desde Persistence y construye ctx
 *        (solape real, salud degradada, aviso aceptado, sitio existente,
 *        par ENTER/EXIT fiable).
 *     3. sessionMachine.transition (pura).
 *     4. UNA transacción: INSERT/UPDATE de sesión + asiento del ledger.
 *     5. Refleja en el store (la UI nunca decide transiciones).
 *     6. Ejecuta efectos vía puertos inyectados (geocerca, FGS, rastro,
 *        temporizador de decisión de salida, notificaciones).
 *     7. Devuelve la vista previa de nómina.
 *
 * Origen: reducer + effects de GEOTrack (src/core/reducer, src/core/effects)
 * y sessionStoreAdapter; SessionEngineService de LEDTracker.
 * Solo este servicio muta el ciclo de vida: geocerca, notificaciones y
 * watchdog entran como intenciones con su origen.
 */
import type {
  IntentOrigin,
  IntentResult,
  LedgerActor,
  SessionIntent,
  SessionPayrollPreview,
  SessionRecord,
  SpatialFact,
} from "../../core/contracts";
import { ORIGIN_TO_ACTOR } from "../../core/contracts";
import { Store, StoreActions } from "../../core/store";
import { serializeError } from "../../utils/serializeError";
import { FeedbackService } from "../application/FeedbackService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { SettingsService } from "../persistence/SettingsService";
import { ConcurrencyGuardService, MutexBusyError } from "./ConcurrencyGuardService";
import { DualDisclosureService } from "./DualDisclosureService";
import { IntegrityLedgerService } from "./IntegrityLedgerService";
import { PayrollEngineService } from "./PayrollEngineService";
import type { EngineEffect, TransitionContext } from "./sessionMachine";
import { transition } from "./sessionMachine";

// ---------------------------------------------------------------------------
// Puertos hacia Runtime (inyectados en boot para no acoplar Dominio → Runtime)
// ---------------------------------------------------------------------------

export interface SessionRuntimePorts {
  /** Arranca/para geocerca, servicio en primer plano y rastro según estado. */
  syncRuntime(effect: Extract<EngineEffect, { type: "SYNC_RUNTIME" }>, session: SessionRecord): Promise<void>;
  /** Programa EXIT_DECISION_TIMER (ventana = policy.exitDecisionWindowMs). */
  scheduleExitDecision(sessionId: number, firstExitAtMs: number, windowMs: number): Promise<void>;
  cancelExitDecision(sessionId: number): Promise<void>;
}

const NOOP_PORTS: SessionRuntimePorts = {
  async syncRuntime() {},
  async scheduleExitDecision() {},
  async cancelExitDecision() {},
};

let ports: SessionRuntimePorts = NOOP_PORTS;

const SESSION_LOCK = "session";

/** Intenciones que operan sobre una sesión concreta (no la abierta). */
function targetIdOf(intent: SessionIntent): number | null {
  switch (intent.type) {
    case "MANUAL_PATCH":
    case "ADD_NOTE":
    case "DELETE_SESSION":
    case "RESOLVE_KEEP_GPS":
    case "RESOLVE_MANUAL":
    case "RESOLVE_SPLIT":
      return intent.sessionId;
    default:
      return null;
  }
}

/** Payload del ledger sin coordenadas en claro (van selladas en spatial_facts). */
function ledgerData(intent: SessionIntent): unknown {
  if ((intent.type === "EXIT_DETECTED" || intent.type === "ARRIVAL_CONFIRMED") && intent.fact) {
    const { lat: _lat, lon: _lon, ...rest } = intent.fact;
    return { ...intent, fact: rest };
  }
  return intent;
}

function degradedReason(): TransitionContext["degradedReason"] {
  const h = Store.getState().health;
  if (h.locationBackground === "denied" || h.locationBackground === "blocked") return "BACKGROUND_PERMISSION_MISSING";
  if (h.clockDriftExceeded || TimeAuthorityService.isDriftExceeded()) return "CLOCK_DRIFT";
  return null;
}

async function hasCleanGpsPair(sessionId: number): Promise<boolean> {
  const facts = await PersistenceService.listSpatialFacts(sessionId, ["ENTER", "EXIT"]);
  return facts.some((f) => f.type === "ENTER" && f.reliable) && facts.some((f) => f.type === "EXIT" && f.reliable);
}

let idSeq = 0;
function newId(): string {
  return `tr-${TimeAuthorityService.now().toString(36)}-${(++idSeq).toString(36)}`;
}

export type DispatchResult = IntentResult<{ session: SessionRecord; preview: SessionPayrollPreview | null }>;

export const SessionEngineService = {
  setRuntimePorts(p: SessionRuntimePorts | null): void {
    ports = p ?? NOOP_PORTS;
  },

  /** Punto de entrada único de intenciones de jornada. */
  async dispatch(intent: SessionIntent, origin: IntentOrigin): Promise<DispatchResult> {
    const actor: LedgerActor = ORIGIN_TO_ACTOR[origin];
    try {
      return await ConcurrencyGuardService.withLock(SESSION_LOCK, origin, intent.type, async () => {
        const settings = await SettingsService.load();
        const open = await PersistenceService.getOpenSession();
        const targetId = targetIdOf(intent);
        const target = targetId !== null ? await PersistenceService.getSession(targetId) : null;
        const nowMs = TimeAuthorityService.now();

        const sites = await PersistenceService.listSites();
        const activeSiteIds = new Set(sites.filter((s) => s.active).map((s) => s.id));

        const ctx: TransitionContext = {
          nowMs,
          actor,
          policyId: settings.company.overtimePolicyId,
          company: settings.company,
          disclosureAccepted: DualDisclosureService.isAccepted(settings.device),
          degradedReason: degradedReason(),
          siteExists: (id) => activeSiteIds.has(id),
          newId,
        };
        if (intent.type === "MANUAL_PATCH" && target) {
          // Solape REAL (sustituye la regla demo "00:00" de W Tracker).
          ctx.overlap = await PersistenceService.checkOverlap(intent.declaredStartAtMs, intent.endAtMs, target.id);
        }
        if (intent.type === "RESOLVE_KEEP_GPS" && target) {
          ctx.cleanGpsPair = await hasCleanGpsPair(target.id);
        }

        const out = transition(open, intent, ctx, target);
        if (!out.ok) {
          LoggingService.log("AMARILLO", "INTENCION_RECHAZADA", "WARN", `${intent.type} rechazada: ${out.code}`, {
            origin,
            detail: out.detail,
          });
          return { ok: false as const, code: out.code, detail: out.detail };
        }

        // 4) Persistencia atómica: registro + asiento.
        const saved = await PersistenceService.transaction(async (db) => {
          let record = out.next;
          if (out.isNew) {
            const id = await PersistenceService.insertSession(record, db);
            record = { ...record, id };
          } else {
            await PersistenceService.updateSession(record, db);
          }
          await IntegrityLedgerService.append(
            {
              sessionId: record.id,
              actor,
              intent: intent.type,
              fromState: out.from,
              toState: out.to,
              reason: out.reason,
              timestampMs: nowMs,
              integrityClass: record.integrityClass,
              data: ledgerData(intent),
            },
            db,
          );
          return record;
        });

        // 5) Reflejo.
        StoreActions.sessionUpserted(saved);
        if (out.to === "SALIDA") StoreActions.uiRequest({ openExitModal: true });
        if (out.from === "SALIDA" && out.to !== "SALIDA") StoreActions.uiRequest({ openExitModal: false });

        // 6) Efectos (fallos no revierten el dominio; quedan en log).
        for (const eff of out.effects) {
          const effect = eff.type === "SYNC_RUNTIME" && out.isNew ? { ...eff, sessionId: saved.id } : eff;
          try {
            if (effect.type === "SYNC_RUNTIME") await ports.syncRuntime(effect, saved);
            else if (effect.type === "SCHEDULE_EXIT_DECISION")
              await ports.scheduleExitDecision(saved.id, effect.firstExitAtMs, settings.company.exitDecisionWindowMs);
            else await ports.cancelExitDecision(saved.id);
          } catch (error) {
            LoggingService.log("ROJO", "ERROR_EFECTO", "ERROR", `Efecto ${effect.type} falló`, serializeError(error));
          }
        }

        if (out.feedback && out.feedback !== "EXIT_DETECTED") {
          const site = intent.type === "TRANSFER_START" ? sites.find((s) => s.id === intent.toSiteId)?.alias ?? "" : "";
          FeedbackService.emit(out.feedback, { site });
        }

        // 7) Efecto de nómina tentativo.
        const preview = PayrollEngineService.previewSession(
          saved,
          { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
          settings.company,
          nowMs,
        );
        return { ok: true as const, data: { session: saved, preview } };
      });
    } catch (error) {
      if (error instanceof MutexBusyError) {
        LoggingService.log("NARANJA", "MUTEX", "WARN", `${intent.type} rechazada: candado de ${error.heldBy}`);
        return { ok: false, code: "MUTEX_BUSY", detail: error.heldBy };
      }
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", `Fallo despachando ${intent.type}`, serializeError(error));
      return { ok: false, code: "PERSISTENCE_ERROR", detail: serializeError(error) };
    }
  },

  /**
   * Registra un hecho espacial (GeofenceRuntime / TraceRecorder). Los hechos
   * de perímetro y de calidad (ENTER/EXIT/DWELL/ACCURACY_DROP/PROVIDER_LOSS)
   * generan asiento; los BREADCRUMB no (se resumen y sellan en EvidencePack).
   */
  async recordSpatialFact(fact: SpatialFact & { speedMps?: number | null; altitudeM?: number | null; battery?: number | null }): Promise<number> {
    const id = await PersistenceService.insertSpatialFact(fact);
    StoreActions.healthUpdated({ lastSpatialFactAt: fact.timestampMs });
    if (fact.type !== "BREADCRUMB") {
      await PersistenceService.transaction(async (db) => {
        await IntegrityLedgerService.append(
          {
            sessionId: fact.sessionId,
            actor: "GEOFENCE",
            intent: "SPATIAL_FACT",
            fromState: null,
            toState: null,
            reason: `${fact.type}${fact.reliable ? "" : `_UNRELIABLE:${fact.reason ?? ""}`}`,
            timestampMs: fact.timestampMs,
            integrityClass: null,
            data: { factId: id, type: fact.type, accuracyM: fact.accuracyM, reliable: fact.reliable, siteId: fact.siteId ?? null },
          },
          db,
        );
      });
    }
    return id;
  },

  /**
   * Heartbeat roto al rehidratar (§5.8): se anota OS_KILL en el ledger sin
   * duplicar ni alterar la sesión (criterio de aceptación §10).
   */
  async recordOsKill(session: SessionRecord, lastHeartbeatMs: number): Promise<void> {
    const nowMs = TimeAuthorityService.now();
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        {
          sessionId: session.id,
          actor: "SYSTEM",
          intent: "OS_KILL",
          fromState: session.domainStatus,
          toState: session.domainStatus,
          reason: "HEARTBEAT_GAP",
          timestampMs: nowMs,
          integrityClass: session.integrityClass,
          data: { lastHeartbeatMs, gapMs: nowMs - lastHeartbeatMs },
        },
        db,
      );
    });
    // TODO(propuesta): no se define si un OS_KILL degrada la clase de la
    // sesión; por ahora solo queda en el ledger.
  },
};
