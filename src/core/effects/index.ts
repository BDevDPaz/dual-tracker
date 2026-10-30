import { now, nowIso } from "../../utils/timeProvider";
import {
  DomainEvent,
  WorkTrackerCanonicalState,
  SessionRecord,
  WorkTrackerRuntimeAdapter,
  AuditLogRecord,
  SystemLogRecord,
} from "../contracts";
import {
  loadSessionRecordsSnapshot,
  loadSystemLogRecordsSnapshot,
} from "../runtime/sessionStoreAdapter";
import { selectEngineState } from "../selectors";

/**
 * UTILS INTERNOS
 */

function getSessionOrThrow(state: WorkTrackerCanonicalState, sessionId: number): SessionRecord {
  const session = state.domain.sessions.byId[String(sessionId)];
  if (!session) {
    throw new Error(`Sesión #${sessionId} no encontrada en el estado.`);
  }
  return session;
}

function isBootRehydrating(state: WorkTrackerCanonicalState): boolean {
  return state.meta.bootState.isRehydrating;
}

function createAuditLogEntry(
  payload: Partial<AuditLogRecord>,
  state: WorkTrackerCanonicalState,
): AuditLogRecord {
  return {
    id: state.domain.audit.auditLogs.length + 1,
    sessionId: payload.sessionId ?? null,
    actionType: payload.actionType ?? "UNKNOWN",
    details: payload.details ?? "",
    timestampMs: payload.timestampMs ?? now(),
  };
}

function createSystemLogEntry(
  payload: Partial<SystemLogRecord>,
  state: WorkTrackerCanonicalState,
): SystemLogRecord {
  return {
    id: state.domain.audit.systemLogs.length + 1,
    timestampMs: payload.timestampMs ?? now(),
    timestampIso: payload.timestampIso ?? nowIso(),
    color: payload.color ?? "BLANCO",
    category: payload.category ?? "SISTEMA",
    severity: payload.severity ?? "INFO",
    message: payload.message ?? "",
    metadataJson: payload.metadataJson ?? null,
    user_id: payload.user_id ?? state.domain.settings.employeeName,
    session_id: payload.session_id ?? null,
    event_type: payload.event_type ?? null,
    location: payload.location ?? null,
    device_state: payload.device_state ?? null,
    trigger_source: payload.trigger_source ?? "ENGINE",
    reason: payload.reason ?? null,
    signature: payload.signature ?? null,
    event_state: selectEngineState(state),
    from_state: (payload as any).from_state ?? null,
    to_state: (payload as any).to_state ?? null,
    sync_status: (payload as any).sync_status ?? "PENDING",
  };
}

/**
 * HANDLERS DE EFECTOS
 */

async function handleAppBootStarted(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const settings = await runtime.sessionStore.getSettings();
  const sessions = await loadSessionRecordsSnapshot();
  const systemLogs = await loadSystemLogRecordsSnapshot();
  const auditLogs = await runtime.logging.getAuditLogs();

  const secondaryEvents: DomainEvent[] = [];

  if (settings) secondaryEvents.push({ type: "SETTINGS_REHYDRATED", settings });
  secondaryEvents.push({ type: "SESSIONS_REHYDRATED", sessions });
  secondaryEvents.push({ type: "SYSTEM_LOGS_REHYDRATED", entries: systemLogs });
  secondaryEvents.push({ type: "AUDIT_LOGS_REHYDRATED", entries: auditLogs });

  const activeSession = sessions.find(
    (s) =>
      s.lifecycle.domainStatus === "ACTIVE_WORK" ||
      s.lifecycle.domainStatus === "GEOFENCE_CREATED" ||
      s.lifecycle.domainStatus === "TRAVEL" ||
      s.lifecycle.domainStatus === "PENDING_EXIT_CONFIRMATION",
  );

  if (activeSession) {
    const status = activeSession.lifecycle.domainStatus;
    const isMonitoringRequired = [
      "GEOFENCE_CREATED",
      "TRAVEL",
      "ACTIVE_WORK",
      "PENDING_EXIT_CONFIRMATION",
    ].includes(status);

    if (isMonitoringRequired) {
      secondaryEvents.push({
        type: "GEOFENCE_MONITORING_STARTED",
        taskName: "GEOFENCE_TRACKING_TASK",
        identifier: `SESSION_${activeSession.id}`,
        latitude: activeSession.destination.targetLatitude || 0,
        longitude: activeSession.destination.targetLongitude || 0,
        radiusMeters: nextState.domain.settings.toleranceRadiusMeters,
      });

      secondaryEvents.push({
        type: "SYSTEM_LOG_APPENDED",
        entry: createSystemLogEntry(
          {
            color: "AZUL",
            category: "SISTEMA",
            severity: "INFO",
            message: `Estado restaurado por el Recovery Engine: ${status}.`,
            session_id: activeSession.id,
            event_type: "RECOVERY_ENGINE_RESTORED_STATE",
            trigger_source: "RECOVERY_ENGINE",
            reason: "PROCESS_OR_DEVICE_RECOVERY",
            from_state: "IDLE",
            to_state: status,
          },
          nextState,
        ),
      });
    }
  }

  secondaryEvents.push({
    type: "APP_REHYDRATION_COMPLETED",
    timestampMs: now(),
  });

  return secondaryEvents;
}

async function handleSessionCreated(
  event: Extract<DomainEvent, { type: "SESSION_CREATED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  await runtime.sessionStore.createSession(event.session);

  const sessionId = event.session.id;

  const hasOverlap = await runtime.sessionStore.checkOverlap(
    event.session.declaredStartAtMs,
    event.session.endAtMs ?? 0,
    sessionId,
  );

  const secondaryEvents: DomainEvent[] = [];

  if (hasOverlap) {
    secondaryEvents.push({
      type: "SESSION_OVERLAP_DETECTED",
      sessionId,
    } as DomainEvent);
  }

  return [
    ...secondaryEvents,
    {
      type: "GEOFENCE_MONITORING_STARTED",
      taskName: "GEOFENCE_TRACKING_TASK",
      identifier: `SESSION_${sessionId}`,
      latitude: event.targetLatitude || 0,
      longitude: event.targetLongitude || 0,
      radiusMeters: nextState.domain.settings.toleranceRadiusMeters,
    },
    {
      type: "AUDIT_LOG_APPENDED",
      entry: createAuditLogEntry(
        {
          sessionId,
          actionType: "SESSION_CREATED",
          details: "USER_ACTION: DAILY_SETUP: Nueva jornada iniciada desde el Daily Setup.",
        },
        nextState,
      ),
    },
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "VERDE",
          category: "OPERACION_EXITOSA",
          severity: "INFO",
          message: `Jornada #${sessionId} creada exitosamente.`,
          session_id: sessionId,
          event_type: "GEOFENCE_CREATED",
          trigger_source: "DAILY_SETUP",
          reason: "DESTINATION_CONFIGURED",
          from_state: selectEngineState(_prevState),
          to_state: "GEOFENCE_CREATED",
        },
        nextState,
      ),
    },
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "AZUL",
          category: "SISTEMA",
          severity: "INFO",
          message: "Servicio de monitoreo iniciado (GEOFENCE_CREATED).",
          session_id: sessionId,
          event_type: "FOREGROUND_SERVICE_STARTED",
          trigger_source: "ENGINE",
          reason: "GEOFENCE_MONITORING_REQUIRED",
          from_state: "IDLE",
          to_state: "GEOFENCE_CREATED",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionDestinationSet(
  event: Extract<DomainEvent, { type: "SESSION_DESTINATION_SET" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);

  await runtime.sessionStore.updateSessionManual(
    session.id,
    session.declaredStartAtMs,
    session.endAtMs,
    session.notes.manualNote || "",
  );

  const monitoringIdentifier =
    (event as { identifier?: string }).identifier ??
    (event as { destinationIdentifier?: string }).destinationIdentifier ??
    (event as { taskName?: string }).taskName ??
    "WORK_ZONE";

  await runtime.location.stopMonitoring(); // Clear previous geofence
  await runtime.location.startMonitoringArrival(
    monitoringIdentifier,
    event.targetLatitude ?? 0,
    event.targetLongitude ?? 0,
    nextState.domain.settings.toleranceRadiusMeters,
  );

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "AZUL",
          category: "UBICACION",
          severity: "INFO",
          message: `Nuevo destino configurado para sesión #${session.id}.`,
          session_id: session.id,
          event_type: "DESTINATION_SET",
          trigger_source: "USER_ACTION",
          from_state: selectEngineState(_prevState),
          to_state: selectEngineState(nextState),
          reason: "USER_SET_DESTINATION",
        },
        nextState,
      ),
    },
    {
      type: "GEOFENCE_MONITORING_STARTED",
      taskName: "GEOFENCE_TRACKING_TASK",
      identifier: monitoringIdentifier,
      latitude: event.targetLatitude ?? 0,
      longitude: event.targetLongitude ?? 0,
      radiusMeters: nextState.domain.settings.toleranceRadiusMeters,
    },
  ];
}

async function handleGeofenceMonitoringStarted(
  event: Extract<DomainEvent, { type: "GEOFENCE_MONITORING_STARTED" }>,
  _prevState: WorkTrackerCanonicalState,
  _nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  await runtime.location.startMonitoringArrival(
    event.identifier,
    event.latitude,
    event.longitude,
    event.radiusMeters,
  );
  return [];
}

async function handleGeofenceMonitoringStopped(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  _nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  await runtime.location.stopMonitoring();
  return [];
}

async function handleSessionTransitStarted(
  event: Extract<DomainEvent, { type: "SESSION_TRANSIT_STARTED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.updateStatus(session.id, "TRAVEL");

  // 1. Cerrar o destruir geocerca anterior.
  await runtime.location.stopMonitoring();
  await runtime.location.clearLastExitTimestamp();

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "AZUL",
          category: "UBICACION",
          severity: "INFO",
          message: `Sesión #${session.id} en estado TRAVEL (Tránsito iniciado).`,
          session_id: session.id,
          event_type: "TRAVEL",
          trigger_source: (event as any).trigger_source || "USER_SELECTED_OTHER_JOB",
          reason: (event as any).reason || "WORK_CONTINUITY_TRANSFER",
          from_state: selectEngineState(_prevState),
          to_state: selectEngineState(nextState),
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionArrivalConfirmedManual(
  event: Extract<DomainEvent, { type: "SESSION_ARRIVAL_CONFIRMED_MANUAL" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.confirmArrival(session.id, event.actualStartAtMs);

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "VERDE",
          category: "OPERACION_EXITOSA",
          severity: "INFO",
          message: `Llegada confirmada manualmente para sesión #${session.id}.`,
          session_id: session.id,
          event_type: "ACTIVE_WORK",
          trigger_source: "USER_ACTION",
          from_state: selectEngineState(_prevState),
          to_state: "ACTIVE_WORK",
          reason: "MANUAL_ARRIVAL_CONFIRMED",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionAutoCheckinGps(
  event: Extract<DomainEvent, { type: "SESSION_AUTO_CHECKIN_GPS" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.confirmArrival(session.id, event.actualStartAtMs);

  await runtime.location.clearLastExitTimestamp();

  await runtime.notifications.notifyImmediate(
    "Auto Check-in GPS ✅",
    `Llegada automática registrada para la sesión #${session.id}.`,
    {
      sessionId: session.id,
      action: "AUTO_CHECKIN_GPS",
    },
  );

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "VERDE",
          category: "UBICACION",
          severity: "INFO",
          message: `Auto Check-in (GPS) completado para sesión #${session.id}.`,
          session_id: session.id,
          event_type: "AUTO_CHECKIN_GEOFENCE_ENTRY",
          trigger_source: "GEOFENCE_ENTRY",
          reason: "VALID_ENTRY_CONFIRMED",
          from_state: selectEngineState(_prevState),
          to_state: "ACTIVE_WORK",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionExitDetected(
  event: Extract<DomainEvent, { type: "SESSION_EXIT_DETECTED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.location.setLastExitTimestamp(event.exitTimestampMs);
  await runtime.notifications.notifyActionableExit(session.id);

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "NARANJA",
          category: "UBICACION",
          severity: "WARN",
          message: `Salida detectada para sesión #${session.id}. Esperando resolución.`,
          session_id: session.id,
          event_type: "VALID_GEOFENCE_EXIT",
          trigger_source: "GEOFENCE_EXIT",
          reason: "VALID_EXIT_CONFIRMED",
          from_state: selectEngineState(_prevState),
          to_state: "PENDING_EXIT_CONFIRMATION",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionExitResolvedContinue(
  event: Extract<DomainEvent, { type: "SESSION_EXIT_RESOLVED_CONTINUE" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.location.clearLastExitTimestamp();

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "VERDE",
          category: "UBICACION",
          severity: "INFO",
          message: `Re-entrada confirmada para sesión #${session.id}.`,
          session_id: session.id,
          event_type: "RE_ENTRY_CONFIRMED",
          trigger_source: (event as any).trigger_source || "GEOFENCE_ENTRY",
          from_state: selectEngineState(_prevState),
          to_state: selectEngineState(nextState),
          reason: (event as any).reason || "USER_RETURNED_TO_SITE",
        },
        nextState,
      ),
    },
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "AZUL",
          category: "SISTEMA",
          severity: "INFO",
          message: `Resolución de salida: El usuario decidió continuar la sesión #${session.id}.`,
          session_id: session.id,
          event_type: "ACTIVE_WORK",
          trigger_source: "USER_ACTION",
          from_state: selectEngineState(_prevState),
          to_state: selectEngineState(nextState),
          reason: "USER_CONFIRMED_CONTINUE",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionAutoCheckout(
  event: Extract<
    DomainEvent,
    { type: "SESSION_AUTO_CHECKOUT_GPS" | "SESSION_AUTO_CHECKOUT_FAILSAFE" }
  >,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.closeSession(session.id, event.endAtMs);
  await runtime.location.stopMonitoring();

  const isFailsafe = event.type === "SESSION_AUTO_CHECKOUT_FAILSAFE";

  await runtime.notifications.notifyImmediate(
    "Jornada Finalizada 🏁",
    isFailsafe
      ? "Tu sesión se cerró automáticamente por failsafe (no hubo respuesta)."
      : "Tu sesión se cerró automáticamente por inactividad.",
    {
      sessionId: session.id,
      action: isFailsafe ? "AUTO_CHECKOUT_FAILSAFE" : "AUTO_CHECKOUT_GPS",
    },
  );

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "ROJO",
          category: "SISTEMA",
          severity: "WARN",
          message: isFailsafe
            ? `Auto Check-out (FAILSAFE) para sesión #${session.id} tras timeout.`
            : `Auto Check-out (GPS) para sesión #${session.id} por inactividad.`,
          session_id: session.id,
          event_type: isFailsafe ? "AUTO_CHECKOUT_FAILSAFE" : "AUTO_CHECKOUT_GPS",
          trigger_source: isFailsafe ? "FAILSAFE_SERVICE" : "WORKMANAGER",
          from_state: selectEngineState(_prevState),
          to_state: "CLOSED",
          reason: isFailsafe ? "failsafe_timeout" : "gps_exit_confirmed",
        },
        nextState,
      ),
    },
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "AZUL",
          category: "SISTEMA",
          severity: "INFO",
          message: isFailsafe
            ? "Servicio de monitoreo detenido (FAILSAFE)."
            : "Servicio de monitoreo detenido (AUTO_GPS).",
          session_id: session.id,
          event_type: "FOREGROUND_SERVICE_STOPPED",
          trigger_source: isFailsafe ? "FAILSAFE_SERVICE" : "WORKMANAGER",
          reason: "WORK_SESSION_CLOSED",
          from_state: selectEngineState(_prevState),
          to_state: "CLOSED",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionClosedManual(
  event: Extract<DomainEvent, { type: "SESSION_CLOSED_MANUAL" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.closeSession(session.id, event.endAtMs);
  await runtime.location.stopMonitoring();

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "BLANCO",
          category: "OPERACION_EXITOSA",
          severity: "INFO",
          message: `Jornada #${session.id} cerrada manualmente.`,
          session_id: session.id,
          event_type: "MANUAL_CHECKOUT",
          trigger_source: (event as any).trigger_source || "USER_ACTION",
          reason: (event as any).reason || "MANUAL_ACTION_EXPLICT",
          from_state: selectEngineState(_prevState), // Simplified for now
          to_state: "CLOSED",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionPaused(
  event: Extract<DomainEvent, { type: "SESSION_PAUSED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.updateStatus(session.id, "PAUSED");

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "AMARILLO",
          category: "SISTEMA",
          severity: "INFO",
          message: `Sesión #${session.id} pausada.`,
          session_id: session.id,
          event_type: "PAUSED",
          trigger_source: "USER_ACTION",
          from_state: selectEngineState(_prevState),
          to_state: "PAUSED",
          reason: "MANUAL_PAUSE",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionResumed(
  event: Extract<DomainEvent, { type: "SESSION_RESUMED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.updateStatus(session.id, "ACTIVE_WORK");

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "VERDE",
          category: "SISTEMA",
          severity: "INFO",
          message: `Sesión #${session.id} reanudada.`,
          session_id: session.id,
          event_type: "ACTIVE_WORK",
          trigger_source: "USER_ACTION",
          from_state: selectEngineState(_prevState),
          to_state: "ACTIVE_WORK",
          reason: "USER_RESUMED_WORK",
        },
        nextState,
      ),
    },
  ];
}

async function handleSessionLunchRecorded(
  event: Extract<DomainEvent, { type: "SESSION_LUNCH_RECORDED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);

  await runtime.sessionStore.updateLunch(
    session.id,
    event.lunchStartAtMs || 0,
    event.lunchEndAtMs || 0,
  );

  return [];
}

async function handleSessionEditedManual(
  event: Extract<DomainEvent, { type: "SESSION_EDITED_MANUAL" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);

  await runtime.sessionStore.updateSessionManual(
    session.id,
    event.startTime,
    event.endTime,
    event.note,
  );

  const hasOverlap = await runtime.sessionStore.checkOverlap(
    event.startTime,
    event.endTime ?? 0,
    session.id,
  );

  if (hasOverlap) {
    return [
      {
        type: "SESSION_OVERLAP_DETECTED",
        sessionId: session.id,
      } as DomainEvent,
    ];
  }

  return [];
}

async function handleSessionDeletedSoft(
  event: Extract<DomainEvent, { type: "SESSION_DELETED_SOFT" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);
  await runtime.sessionStore.deleteSession(session.id);

  if (nextState.domain.sessions.activeSessionId === null) {
    await runtime.location.stopMonitoring();
  }

  return [];
}

async function handleSessionNoteAdded(
  event: Extract<DomainEvent, { type: "SESSION_NOTE_ADDED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  if (isBootRehydrating(nextState)) return [];

  const session = getSessionOrThrow(nextState, event.sessionId);

  await runtime.sessionStore.updateSessionManual(
    session.id,
    session.declaredStartAtMs,
    session.endAtMs,
    event.note,
  );

  return [];
}

async function handleSessionOverlapDetected(
  event: Extract<DomainEvent, { type: "SESSION_OVERLAP_DETECTED" }>,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const message = `¡Atención! La sesión #${event.sessionId} se solapa con otra existente.`;

  await runtime.notifications.notifyImmediate("Solapamiento detectado ⚠️", message, {
    sessionId: event.sessionId,
    action: "SESSION_OVERLAP_DETECTED",
  });

  return [
    {
      type: "SYSTEM_LOG_APPENDED",
      entry: createSystemLogEntry(
        {
          color: "NARANJA",
          category: "SISTEMA",
          severity: "WARN",
          message,
          session_id: event.sessionId,
          event_type: "SESSION_OVERLAP_DETECTED",
          trigger_source: "ENGINE",
          reason: "OVERLAP_DETECTED",
        },
        nextState,
      ),
    },
  ];
}

async function handleReportShareRequested(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const uri = nextState.runtime.background.weeklyReport.lastGeneratedUri;
  if (uri) await runtime.reports.sharePdf(uri);
  return [];
}

async function handleReportEmailRequested(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const uri = nextState.runtime.background.weeklyReport.lastGeneratedUri;
  if (!uri) return [];

  const { companyEmail, employeeName } = nextState.domain.settings;
  await runtime.reports.sendByEmail(uri, companyEmail, employeeName);

  return [];
}

async function handleDataRefreshRequested(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const sessions = await loadSessionRecordsSnapshot();
  const systemLogs = await loadSystemLogRecordsSnapshot();
  const auditLogs = await runtime.logging.getAuditLogs();

  return [
    { type: "SESSIONS_REHYDRATED", sessions },
    { type: "SYSTEM_LOGS_REHYDRATED", entries: systemLogs },
    { type: "AUDIT_LOGS_REHYDRATED", entries: auditLogs },
  ];
}

async function handleAdminAccessValidationStarted(
  event: any,
  _prevState: WorkTrackerCanonicalState,
  _nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const isValid = await runtime.security.validateAdminPin(event.pin || "");

  return [
    isValid
      ? { type: "ADMIN_ACCESS_GRANTED", timestampMs: now() }
      : { type: "ADMIN_ACCESS_DENIED" },
  ];
}

async function handleSystemLogAppended(
  event: any,
  _prevState: WorkTrackerCanonicalState,
  _nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  await runtime.logging.appendSystemLog(event.entry);
  return [];
}

async function handleAuditLogAppended(
  event: any,
  _prevState: WorkTrackerCanonicalState,
  _nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  await runtime.logging.appendAuditLog(event.entry);
  return [];
}

async function handleOnboardingCompleted(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  await runtime.sessionStore.saveSettings(nextState.domain.settings);
  return [];
}

async function handleDisclaimerAccepted(
  _event: any,
  _prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  await runtime.sessionStore.saveSettings(nextState.domain.settings);
  return [];
}

const handlers: Record<string, any> = {
  ONBOARDING_COMPLETED: handleOnboardingCompleted,
  DISCLAIMER_ACCEPTED: handleDisclaimerAccepted,
  APP_BOOT_STARTED: handleAppBootStarted,
  DATA_REFRESH_REQUESTED: handleDataRefreshRequested,
  SESSION_CREATED: handleSessionCreated,
  SESSION_DESTINATION_SET: handleSessionDestinationSet,
  GEOFENCE_MONITORING_STARTED: handleGeofenceMonitoringStarted,
  GEOFENCE_MONITORING_STOPPED: handleGeofenceMonitoringStopped,
  SESSION_TRANSIT_STARTED: handleSessionTransitStarted,
  SESSION_ARRIVAL_CONFIRMED_MANUAL: handleSessionArrivalConfirmedManual,
  SESSION_AUTO_CHECKIN_GPS: handleSessionAutoCheckinGps,
  SESSION_EXIT_DETECTED: handleSessionExitDetected,
  SESSION_EXIT_RESOLVED_CONTINUE: handleSessionExitResolvedContinue,
  SESSION_AUTO_CHECKOUT_GPS: handleSessionAutoCheckout,
  SESSION_AUTO_CHECKOUT_FAILSAFE: handleSessionAutoCheckout,
  SESSION_CLOSED_MANUAL: handleSessionClosedManual,
  SESSION_PAUSED: handleSessionPaused,
  SESSION_RESUMED: handleSessionResumed,
  SESSION_LUNCH_RECORDED: handleSessionLunchRecorded,
  SESSION_EDITED_MANUAL: handleSessionEditedManual,
  SESSION_DELETED_SOFT: handleSessionDeletedSoft,
  SESSION_NOTE_ADDED: handleSessionNoteAdded,
  SESSION_OVERLAP_DETECTED: handleSessionOverlapDetected,
  REPORT_SHARE_REQUESTED: handleReportShareRequested,
  REPORT_EMAIL_REQUESTED: handleReportEmailRequested,
  ADMIN_ACCESS_VALIDATION_STARTED: handleAdminAccessValidationStarted,
  SYSTEM_LOG_APPENDED: handleSystemLogAppended,
  AUDIT_LOG_APPENDED: handleAuditLogAppended,
};

export async function executeEffects(
  event: DomainEvent,
  prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
): Promise<DomainEvent[]> {
  const handler = handlers[event.type];
  if (!handler) return [];

  try {
    const secondaryEvents = await handler(event, prevState, nextState, runtime);
    return Array.isArray(secondaryEvents) ? secondaryEvents : [];
  } catch (error) {
    return [
      {
        type: "SYSTEM_ERROR_RECORDED",
        entry: createSystemLogEntry(
          {
            color: "ROJO",
            category: "ERROR_CRITICO",
            severity: "ERROR",
            message: `Error en effects para ${event.type}: ${String(error)}`,
          },
          nextState,
        ),
      } as any,
    ];
  }
}
