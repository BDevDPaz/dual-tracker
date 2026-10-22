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
import type * as SQLite from "expo-sqlite";
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
import { GEOFENCE_ENTER_AFTER_EXIT_MS, GEOFENCE_ENTER_COALESCE_MS } from "../../constants/geolocation";
import { blockingIntegrityReason } from "../../core/healthPolicy";
import { companyCalendar } from "../../utils/companyPolicy";
import { workweekEndAt, workweekStartAt } from "../../utils/dateUtils";
import { FeedbackService } from "../application/FeedbackService";
import { deviceOffGap } from "../evidence/deviceOffGap";
import { appendSessionSeal } from "../evidence/sessionSeal";
import { readDeviceUptimeMs } from "../runtime/deviceUptime";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService, type WriteReport } from "../persistence/PersistenceService";
import { SettingsService } from "../persistence/SettingsService";
import { ConcurrencyGuardService, MutexBusyError } from "./ConcurrencyGuardService";
import { DualDisclosureService } from "./DualDisclosureService";
import { IntegrityLedgerService } from "./IntegrityLedgerService";
import { PayrollEngineService } from "./PayrollEngineService";
import { FixedLunchError, FutureTimestampError } from "./sessionTimeGuard";
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

/**
 * FieldCrypto v1.3 §12: ¿se pueden cifrar notas ahora? Puerto inyectado en
 * boot.wirePorts (SessionEngine no importa FieldCrypto). Por defecto true.
 */
let cryptoAvailable: () => Promise<boolean> = async () => true;

/** Intenciones que escriben nota sobre una sesión cerrada (§12, rechazadas sin cifrado). */
function writesNoteOnClosed(intent: SessionIntent, target: SessionRecord | null): boolean {
  if (!target || target.domainStatus !== "CERRADA") return false;
  switch (intent.type) {
    case "ADD_NOTE":
    case "MANUAL_PATCH":
    case "RESOLVE_MANUAL":
    case "RESOLVE_SPLIT":
      return true;
    case "RESOLVE_KEEP_GPS":
      return !!(intent.note ?? "").trim();
    default:
      return false;
  }
}

/**
 * §12: si una escritura sensible de la sesión salió degradada, agrega el
 * bloqueo FIELD_CRYPTO_UNAVAILABLE (una sola vez, permanente) y el asiento
 * CERT_BLOCKER_ADDED { blocker, field } en la misma transacción.
 */
async function applyCertBlocker(
  db: Parameters<Parameters<typeof PersistenceService.transaction>[0]>[0],
  sessionId: number,
  report: WriteReport,
  actor: LedgerActor,
  nowMs: number,
  integrityClass: SessionRecord["integrityClass"] | null,
): Promise<boolean> {
  if (!report.degradedFields.length) return false;
  const added = await PersistenceService.addCertBlocker(sessionId, "FIELD_CRYPTO_UNAVAILABLE", db);
  if (!added) return false;
  await IntegrityLedgerService.append(
    {
      sessionId,
      actor,
      intent: "CERT_BLOCKER_ADDED",
      fromState: null,
      toState: null,
      reason: "FIELD_CRYPTO_UNAVAILABLE",
      timestampMs: nowMs,
      integrityClass,
      data: { blocker: "FIELD_CRYPTO_UNAVAILABLE", field: report.degradedFields[0] },
    },
    db,
  );
  return true;
}

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
/**
 * Datos del asiento (spec v1.3 §13): sin coordenadas y, desde el payload v2,
 * sin la nota en claro (START_DAY, MANUAL_PATCH, ADD_NOTE, RESOLVE_KEEP_GPS,
 * RESOLVE_MANUAL, RESOLVE_SPLIT): se sustituye por noteDigest vía el digester
 * inyectado. SessionEngine no importa FieldCrypto.
 */
async function ledgerData(intent: SessionIntent): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = { ...intent };
  if ((intent.type === "EXIT_DETECTED" || intent.type === "ARRIVAL_CONFIRMED") && intent.fact) {
    const { lat: _lat, lon: _lon, ...rest } = intent.fact;
    data = { ...data, fact: rest };
  }
  if ("note" in data) {
    const { note, ...rest } = data;
    data = { ...rest, noteDigest: await IntegrityLedgerService.noteDigest(typeof note === "string" ? note : null) };
  }
  return data;
}

/**
 * ENTER repetido de la misma región dentro de la ventana: no se escribe otro
 * asiento. La ventana mira hacia atrás y hacia adelante: los timestamps del
 * libro no llegan en orden. Un ENTER fiable después de uno no fiable sí se
 * anota (mejora la evidencia). Un ENTER no fiable pegado a un EXIT de la
 * misma región se descarta (borde, no reentrada). El ledger no se reescribe.
 */
async function coalescedEnterId(db: SQLite.SQLiteDatabase, fact: SpatialFact): Promise<number | null> {
  if (fact.type !== "ENTER") return null;
  const siteId = fact.siteId ?? null;
  if (!fact.reliable) {
    const exit = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM spatial_facts
       WHERE session_id = ? AND type = 'EXIT' AND site_id IS ?
         AND ABS(timestamp_ms - ?) <= ?
       LIMIT 1`,
      [fact.sessionId, siteId, fact.timestampMs, GEOFENCE_ENTER_AFTER_EXIT_MS],
    );
    if (exit) return exit.id;
  }
  const row = await db.getFirstAsync<{ id: number; reliable: number | null }>(
    `SELECT id, reliable FROM spatial_facts
     WHERE session_id = ? AND type = 'ENTER' AND site_id IS ?
       AND ABS(timestamp_ms - ?) <= ?
     ORDER BY reliable DESC, timestamp_ms DESC
     LIMIT 1`,
    [fact.sessionId, siteId, fact.timestampMs, GEOFENCE_ENTER_COALESCE_MS],
  );
  if (!row) return null;
  if (row.reliable === 1) return row.id;
  if (!fact.reliable) return row.id;
  return null;
}

function degradedReason(open: SessionRecord | null): TransitionContext["degradedReason"] {
  const h = Store.getState().health;
  return blockingIntegrityReason(h, !!open) ?? (TimeAuthorityService.isDriftExceeded() ? "CLOCK_DRIFT" : null);
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

  /** FieldCrypto v1.3 §12: puerto de disponibilidad del cifrado (boot.wirePorts). */
  setCryptoAvailability(fn: (() => Promise<boolean>) | null): void {
    cryptoAvailable = fn ?? (async () => true);
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
          notAfterMs: TimeAuthorityService.futureCeiling(),
          actor,
          policyId: settings.company.overtimePolicyId,
          company: settings.company,
          disclosureAccepted: DualDisclosureService.isAccepted(settings.device),
          degradedReason: degradedReason(open),
          siteExists: (id) => activeSiteIds.has(id),
          newId,
        };
        if (intent.type === "MANUAL_PATCH" && target) {
          // Solape REAL (sustituye la regla demo "00:00" de W Tracker).
          ctx.overlap = await PersistenceService.checkOverlap(intent.declaredStartAtMs, intent.endAtMs, target.id);
        }
        if (intent.type === "RESOLVE_SPLIT" && target && target.endAtMs !== null) {
          const start = target.actualStartAtMs ?? target.declaredStartAtMs;
          ctx.splitOverlap = {
            a: await PersistenceService.checkOverlap(start, intent.splitAtMs, target.id),
            b: await PersistenceService.checkOverlap(intent.splitAtMs, target.endAtMs, target.id),
          };
        }
        if (intent.type === "RESOLVE_KEEP_GPS" && target) {
          ctx.cleanGpsPair = await hasCleanGpsPair(target.id);
        }

        // §12: sin cifrado no se escribe una nota sobre una sesión cerrada.
        if (writesNoteOnClosed(intent, target) && !(await cryptoAvailable())) {
          LoggingService.log("AMARILLO", "INTENCION_RECHAZADA", "WARN", `${intent.type} rechazada: FIELD_CRYPTO_UNAVAILABLE`, { origin });
          return { ok: false as const, code: "FIELD_CRYPTO_UNAVAILABLE" as const };
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
        let extraSaved: SessionRecord | null = null;
        const report: WriteReport = { degradedFields: [] };
        const saved = await PersistenceService.transaction(async (db) => {
          let record = out.next;
          if (out.isNew) {
            const id = await PersistenceService.insertSession(record, db, report);
            record = { ...record, id };
          } else {
            await PersistenceService.updateSession(record, db, report);
          }
          if (await applyCertBlocker(db, record.id, report, actor, nowMs, record.integrityClass)) {
            const blockers = record.bookkeeping.certificationBlockers ?? [];
            record = { ...record, bookkeeping: { ...record.bookkeeping, certificationBlockers: [...blockers, "FIELD_CRYPTO_UNAVAILABLE"] } };
          }
          if (intent.type === "RESOLVE_SPLIT" && out.extra) {
            // spec v1.3 §5.4: B nueva + hechos re-vinculados + exactamente 2 asientos.
            // Los bloqueos de certificación del original se copian a B (bookkeeping heredado).
            const bId = await PersistenceService.insertSession(out.extra, db);
            const b = { ...out.extra, id: bId };
            const movedFacts = await PersistenceService.moveSpatialFacts(record.id, bId, intent.splitAtMs, db);
            await IntegrityLedgerService.append(
              {
                sessionId: record.id,
                actor,
                intent: "RESOLVE_SPLIT",
                fromState: out.from,
                toState: out.to,
                reason: "SESSION_SPLIT",
                timestampMs: nowMs,
                integrityClass: record.integrityClass,
                data: { sessionId: record.id, newSessionId: bId, splitAtMs: intent.splitAtMs, movedFacts, noteDigest: await IntegrityLedgerService.noteDigest(intent.note) },
              },
              db,
            );
            await IntegrityLedgerService.append(
              {
                sessionId: bId,
                actor,
                intent: "RESOLVE_SPLIT",
                fromState: null,
                toState: "CERRADA",
                reason: "SESSION_SPLIT_CREATED",
                timestampMs: nowMs,
                integrityClass: b.integrityClass,
                data: { sessionId: bId, splitFrom: record.id, startMs: b.actualStartAtMs, endMs: b.endAtMs },
              },
              db,
            );
            extraSaved = b;
            return record;
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
              data: { ...(await ledgerData(intent)), ...(out.ledgerExtra ?? {}) },
            },
            db,
          );
          // El sello ve el asiento de cierre: va después, en la misma transacción.
          if (out.to === "CERRADA" && out.from !== "CERRADA") await appendSessionSeal(db, record, nowMs);
          return record;
        });

        // 5) Reflejo.
        StoreActions.sessionUpserted(saved);
        if (extraSaved) StoreActions.sessionUpserted(extraSaved);
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

        // 7) Efecto de nómina tentativo con la política del periodo (spec v1.3 §5.2 N3).
        const history = companyCalendar(settings.company);
        const sStart = saved.actualStartAtMs ?? saved.declaredStartAtMs;
        const pStart = workweekStartAt(sStart, history);
        const pEnd = workweekEndAt(sStart, history);
        const periodPolicy = (await PersistenceService.packPolicyForPeriod(pStart, pEnd)) ?? settings.company.overtimePolicyId;
        const preview = PayrollEngineService.previewSession(
          saved,
          { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
          settings.company,
          nowMs,
          periodPolicy,
        );
        return { ok: true as const, data: { session: saved, preview } };
      });
    } catch (error) {
      if (error instanceof FutureTimestampError) {
        LoggingService.log("AMARILLO", "INTENCION_RECHAZADA", "WARN", `${intent.type} rechazada: FUTURE_TIME`);
        return { ok: false, code: "FUTURE_TIME" };
      }
      if (error instanceof FixedLunchError) {
        LoggingService.log("AMARILLO", "INTENCION_RECHAZADA", "WARN", `${intent.type} rechazada: LUNCH_EXCEEDS_SESSION`);
        return { ok: false, code: "INVALID_TIMES", detail: "LUNCH_EXCEEDS_SESSION" };
      }
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
    const report: WriteReport = { degradedFields: [] };
    let blocked = false;
    let coalesced = false;
    const id = await PersistenceService.transaction(async (db) => {
      const prior = await coalescedEnterId(db, fact);
      if (prior !== null) {
        coalesced = true;
        return prior;
      }
      const factId = await PersistenceService.insertSpatialFact(fact, report, db);
      // §12: coordenadas escritas sin cifrar → bloqueo de certificación de la sesión.
      blocked = await applyCertBlocker(db, fact.sessionId, report, "GEOFENCE", fact.timestampMs, null);
      return factId;
    });
    if (coalesced) return id;
    if (blocked) {
      const s = await PersistenceService.getSession(fact.sessionId);
      if (s) StoreActions.sessionUpserted(s);
    }
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
            data: {
              factId: id,
              type: fact.type,
              accuracyM: fact.accuracyM,
              reliable: fact.reliable,
              siteId: fact.siteId ?? null,
              ...(fact.mocked ? { mocked: true } : {}),
              ...(fact.reason === "MOCK_LOCATION" ? { severity: "HIGH" } : {}),
              ...(fact.reason === "LOCATION_JUMP_DETECTED" || fact.reason === "IMPOSSIBLE_SPEED" ? { severity: "MEDIUM" } : {}),
            },
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
   * Si se conoce el arranque del teléfono, el asiento separa el apagado
   * (último latido → reinicio) del hueco hasta que la app volvió.
   */
  async recordOsKill(session: SessionRecord, lastHeartbeatMs: number): Promise<void> {
    const nowMs = TimeAuthorityService.now();
    const gap = deviceOffGap(lastHeartbeatMs, { nowMs, uptimeMs: await readDeviceUptimeMs() });
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
          data: {
            lastHeartbeatMs: gap.lastHeartbeatMs,
            gapMs: gap.gapMs,
            resumedAtMs: gap.resumedAtMs,
            ...(gap.bootAtMs !== null ? { bootAtMs: gap.bootAtMs } : {}),
            ...(gap.deviceOffMs !== null ? { deviceOffMs: gap.deviceOffMs } : {}),
          },
        },
        db,
      );
    });
    // El OS_KILL solo anota el hueco. La clase pasa a Revisar en otro camino
    // (MARK_ORPHAN) si además no hay fix dentro del sitio. No se inventan horas.
  },
};
