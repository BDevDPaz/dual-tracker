/**
 * ============================================================================
 * 1. CONTRATOS DEL DOMINIO Y REGISTROS PRIMARIOS
 * ============================================================================
 */

export interface SessionRecord {
  id: number;
  declaredStartAtMs: number;
  actualStartAtMs: number | null;
  endAtMs: number | null;
  lifecycle: {
    domainStatus:
      | "GEOFENCE_CREATED"
      | "TRAVEL"
      | "ACTIVE_WORK"
      | "PAUSED"
      | "PENDING_EXIT_CONFIRMATION"
      | "CLOSED";
    isDeleted: boolean;
    isManualEdit: boolean;
    locationConfirmed: boolean;
    totalPausedMs: number;
    lastPauseStartMs: number | null;
  };
  destination: {
    address: string | null;
    clientName: string | null;
    targetLatitude: number | null;
    targetLongitude: number | null;
    setupLatitude: number | null;
    setupLongitude: number | null;
  };
  capturedLocation: {
    latitude: number | null;
    longitude: number | null;
  };
  lunch: {
    taken: boolean;
    startAtMs: number | null;
    endAtMs: number | null;
    deductedMinutes: number | null;
  };
  notes: {
    manualNote: string | null;
  };
  bookkeeping: {
    dateString: string | null;
  };
}

export interface AppSettingsRecord {
  employeeName: string;
  employerName: string;
  companyEmail: string;
  toleranceRadiusMeters: number;
  hourlyRate: number;
  language: "es" | "en";
  dailyReminderTime: string;
  overtimeMultiplier: number;
  onboardingCompleted: boolean;
  disclaimerAccepted: boolean;
}

export interface AuditLogRecord {
  id: number;
  sessionId: number | null;
  actionType: string;
  details: string;
  timestampMs: number;
}

export interface SystemLogRecord {
  user_id: string | null;
  session_id: number | null;
  from_state: string | null;
  to_state: string | null;
  event_type: string | null;
  location: string | null;
  device_state: string | null;
  trigger_source: string | null;
  reason: string | null;
  signature: string | null;
  event_state: string | null;
  sync_status: "PENDING" | "SYNCED" | "FAILED" | null;
  id: number;
  timestampMs: number;
  timestampIso: string;
  color: string;
  category: string;
  severity: string;
  message: string;
  metadataJson: string | null;
}

export interface FeedbackPayload {
  id: string;
  kind: "toast" | "dialog";
  tone: "success" | "error" | "info" | "warning";
  title: string | null;
  message: string;
  dedupeKey: string | null;
  durationMs: number | null;
  destructive: boolean;
}

/**
 * ============================================================================
 * 2. ESTADO CANÓNICO GLOBAL (WorkTrackerCanonicalState)
 * ============================================================================
 */

export interface WorkTrackerCanonicalState {
  meta: {
    schemaVersion: number;
    timezone: string;
    locale: "es" | "en";
    bootState: {
      isRehydrating: boolean;
      lastHydratedAtMs: number | null;
    };
  };
  domain: {
    sessions: {
      byId: Record<string, SessionRecord>;
      order: number[];
      activeSessionId: number | null;
    };
    settings: AppSettingsRecord;
    audit: {
      auditLogs: AuditLogRecord[];
      systemLogs: SystemLogRecord[];
    };
  };
  runtime: {
    permissions: {
      locationForeground: "unknown" | "granted" | "denied";
      locationBackground: "unknown" | "granted" | "denied";
      notifications: "unknown" | "granted" | "denied";
    };
    geofence: {
      isMonitoring: boolean;
      taskName: string;
      lastExitTimestampMs: number | null;
      monitoredRegion: {
        identifier: string | null;
        latitude: number | null;
        longitude: number | null;
        radiusMeters: number | null;
      };
    };
    background: {
      appTask: {
        isRegistered: boolean;
        isRunning: boolean;
        taskName: string;
      };
      weeklyReport: {
        lastReportedWeekId: string | null;
        lastGeneratedUri: string | null;
        generationStatus: "IDLE" | "generating" | "generated" | "failed";
      };
    };
    notifications: {
      defaultChannelReady: boolean;
      lastScheduledReminderTime: string | null;
    };
    security: {
      adminAccess: {
        isUnlocked: boolean;
        lastValidatedAtMs: number | null;
        validationStatus: "IDLE" | "validating" | "granted" | "denied" | "error";
      };
    };
    transient: {
      pendingFeedback: FeedbackPayload[];
      draftNotesBySessionId: Record<string, string>;
      exportIntent: {
        shouldShareAfterGenerate: boolean;
        shouldSendByEmailAfterGenerate: boolean;
      };
    };
  };
  views: {
    currentOperationalState: {
      engineState:
        | "IDLE"
        | "GEOFENCE_CREATED"
        | "ACTIVE_WORK"
        | "PAUSED"
        | "PENDING_EXIT_CONFIRMATION"
        | "TRAVEL"
        | "CLOSED";
    };
    selectedSession: {
      selectedSessionId: number | null;
    };
    history: {
      activeFilter: "Todos" | "Semana" | "Mes";
    };
    report: {
      selectedRange: {
        startAtMs: number | null;
        endAtMs: number | null;
        label: string | null;
      };
    };
  };
}

/**
 * ============================================================================
 * 3. CATÁLOGO FORMAL DE EVENTOS (DomainEvent)
 * ============================================================================
 */

export type SessionEvent =
  | {
      type: "SESSION_CREATED";
      session: Partial<SessionRecord> & {
        id: number;
        declaredStartAtMs: number;
        domainStatus: "GEOFENCE_CREATED" | "TRAVEL";
      };
      address?: string;
      clientName?: string;
      targetLatitude?: number;
      targetLongitude?: number;
      setupLatitude?: number;
      setupLongitude?: number;
      manualNote?: string;
      dateString?: string;
    }
  | {
      type: "SESSION_DESTINATION_SET";
      sessionId: number;
      address?: string;
      clientName?: string;
      targetLatitude?: number;
      targetLongitude?: number;
      setupLatitude?: number;
      setupLongitude?: number;
    }
  | { type: "SESSION_TRANSIT_STARTED"; sessionId: number }
  | {
      type: "SESSION_ARRIVAL_CONFIRMED_MANUAL";
      sessionId: number;
      actualStartAtMs: number;
    }
  | {
      type: "SESSION_AUTO_CHECKIN_GPS";
      sessionId: number;
      actualStartAtMs: number;
    }
  | {
      type: "SESSION_EXIT_DETECTED";
      sessionId: number;
      exitTimestampMs: number;
    }
  | { type: "SESSION_EXIT_RESOLVED_CONTINUE"; sessionId: number }
  | { type: "SESSION_AUTO_CHECKOUT_GPS"; sessionId: number; endAtMs: number }
  | {
      type: "SESSION_AUTO_CHECKOUT_FAILSAFE";
      sessionId: number;
      endAtMs: number;
    }
  | { type: "SESSION_CLOSED_MANUAL"; sessionId: number; endAtMs: number }
  | { type: "SESSION_PAUSED"; sessionId: number }
  | { type: "SESSION_RESUMED"; sessionId: number }
  | {
      type: "SESSION_LUNCH_RECORDED";
      sessionId: number;
      lunchStartAtMs?: number;
      lunchEndAtMs?: number;
      deductedMinutes?: number;
    }
  | { type: "SESSION_NOTE_ADDED"; sessionId: number; note: string }
  | {
      type: "SESSION_EDITED_MANUAL";
      sessionId: number;
      startTime: number;
      endTime: number | null;
      note: string;
    }
  | { type: "SESSION_DELETED_SOFT"; sessionId: number }
  | { type: "SESSION_OVERLAP_DETECTED"; sessionId: number };

export type SystemEvent =
  | { type: "APP_BOOT_STARTED" }
  | { type: "ONBOARDING_COMPLETED" }
  | { type: "DISCLAIMER_ACCEPTED" }
  | { type: "APP_RESUMED"; timestampMs: number }
  | { type: "APP_REHYDRATION_COMPLETED"; timestampMs: number }
  | { type: "DB_READY" }
  | { type: "PERMISSIONS_REFRESH_REQUESTED" }
  | { type: "DATA_REFRESH_REQUESTED" }
  | {
      type: "PERMISSIONS_LOCATION_UPDATED";
      foreground: "granted" | "denied" | "unknown";
      background: "granted" | "denied" | "unknown";
    }
  | {
      type: "PERMISSIONS_NOTIFICATIONS_UPDATED";
      notifications: "granted" | "denied" | "unknown";
    }
  | {
      type: "GEOFENCE_MONITORING_STARTED";
      taskName: string;
      identifier: string;
      latitude: number;
      longitude: number;
      radiusMeters: number;
    }
  | { type: "GEOFENCE_MONITORING_STOPPED" }
  | { type: "BACKGROUND_TASK_REGISTERED"; taskName: string }
  | { type: "BACKGROUND_TASK_UNREGISTERED" }
  | { type: "BACKGROUND_TASK_STARTED" }
  | { type: "BACKGROUND_TASK_FINISHED" }
  | { type: "SYSTEM_ERROR_RECORDED"; entry: Partial<SystemLogRecord> };

export type ReportEvent =
  | {
      type: "REPORT_RANGE_SELECTED";
      startAtMs: number;
      endAtMs: number;
      label: string;
    }
  | { type: "REPORT_GENERATION_STARTED" }
  | { type: "REPORT_GENERATION_SUCCEEDED"; uri: string }
  | { type: "REPORT_GENERATION_FAILED" }
  | { type: "REPORT_SHARE_REQUESTED" }
  | { type: "REPORT_EMAIL_REQUESTED" }
  | { type: "REPORT_MARKED_AS_WEEKLY_DELIVERED"; weekId: string };

export type SecurityAndFeedbackEvent =
  | { type: "ADMIN_ACCESS_VALIDATION_STARTED" }
  | { type: "ADMIN_ACCESS_GRANTED"; timestampMs: number }
  | { type: "ADMIN_ACCESS_DENIED" }
  | { type: "ADMIN_ACCESS_LOCKED" }
  | {
      type: "FEEDBACK_ENQUEUED";
      feedback: Partial<FeedbackPayload> & {
        id: string;
        kind: "toast" | "dialog";
        message: string;
      };
    }
  | { type: "FEEDBACK_DISMISSED"; feedbackId: string };

export type LogEvent =
  | { type: "SYSTEM_LOG_APPENDED"; entry: SystemLogRecord }
  | { type: "AUDIT_LOG_APPENDED"; entry: AuditLogRecord };

/**
 * Eventos de rehidratación masiva.
 */
export type RehydrationEvent =
  | { type: "SETTINGS_REHYDRATED"; settings: AppSettingsRecord }
  | { type: "AUDIT_LOGS_REHYDRATED"; entries: AuditLogRecord[] }
  | { type: "SESSIONS_REHYDRATED"; sessions: SessionRecord[] }
  | { type: "SYSTEM_LOGS_REHYDRATED"; entries: SystemLogRecord[] };

/**
 * BaseDomainEvent:
 * Todos los eventos del sistema excepto retry.
 * Esto evita recursión insegura al tipar originalEvent dentro de RetryEvent.
 */
export type BaseDomainEvent =
  SessionEvent | SystemEvent | ReportEvent | SecurityAndFeedbackEvent | LogEvent | RehydrationEvent;

/**
 * Evento formal de retry.
 * Se usa para reprocesar eventos fallidos sin perder trazabilidad.
 */
export type RetryEvent = {
  type: "EVENT_RETRY_REQUESTED";
  originalEvent: BaseDomainEvent;
  retryCount: number;
  reason: string;
};

export type DomainEvent = BaseDomainEvent | RetryEvent;

/**
 * ============================================================================
 * 4. CONTRATOS DE INFRAESTRUCTURA (Effect Handlers & Adapters)
 * ============================================================================
 */

export interface WorkTrackerRuntimeAdapter {
  sessionStore: any;
  location: any;
  notifications: any;
  reports: any;
  security: any;
  logging: any;
}

export type EffectHandler = (
  event: DomainEvent,
  prevState: WorkTrackerCanonicalState,
  nextState: WorkTrackerCanonicalState,
  runtime: WorkTrackerRuntimeAdapter,
) => Promise<DomainEvent[]>;
