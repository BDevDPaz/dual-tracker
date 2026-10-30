import { now, toDateString } from "../../utils/timeProvider";
import {
  DomainEvent,
  WorkTrackerCanonicalState,
  SessionRecord,
  FeedbackPayload,
} from "../contracts";

function buildSessionRecordFromEvent(event: any): SessionRecord {
  return {
    id: event.session.id,
    declaredStartAtMs: event.session.declaredStartAtMs,
    actualStartAtMs: null,
    endAtMs: null,
    lifecycle: {
      domainStatus: event.session.domainStatus || "GEOFENCE_CREATED",
      isDeleted: false,
      isManualEdit: false,
      locationConfirmed: false,
      totalPausedMs: 0,
      lastPauseStartMs: null,
    },
    destination: {
      address: event.session.destination?.address || null,
      clientName: event.session.destination?.clientName || null,
      targetLatitude: event.session.destination?.targetLatitude ?? null,
      targetLongitude: event.session.destination?.targetLongitude ?? null,
      setupLatitude: event.session.destination?.setupLatitude ?? null,
      setupLongitude: event.session.destination?.setupLongitude ?? null,
    },
    capturedLocation: {
      latitude: null,
      longitude: null,
    },
    lunch: {
      taken: false,
      startAtMs: null,
      endAtMs: null,
      deductedMinutes: null,
    },
    notes: {
      manualNote: event.session.notes?.manualNote || null,
    },
    bookkeeping: {
      dateString:
        event.session.bookkeeping?.dateString || toDateString(event.session.declaredStartAtMs),
    },
  };
}

function cloneSessionsState(state: WorkTrackerCanonicalState) {
  return {
    ...state.domain.sessions,
    byId: { ...state.domain.sessions.byId },
    order: [...state.domain.sessions.order],
  };
}

function ensureSessionExists(state: WorkTrackerCanonicalState, id: number): SessionRecord {
  const session = state.domain.sessions.byId[String(id)];
  if (!session) throw new Error(`Sesión #${id} no encontrada.`);
  return session;
}

function withDerivedViews(state: WorkTrackerCanonicalState): WorkTrackerCanonicalState {
  // Aquí se podrían derivar estados de vista automáticos si fuera necesario
  return state;
}

function normalizeFeedbackPayload(p: any): FeedbackPayload {
  return {
    id: p.id || String(now()),
    kind: p.kind || "toast",
    tone: p.tone || "info",
    title: p.title || null,
    message: p.message || "",
    dedupeKey: p.dedupeKey || null,
    durationMs: p.durationMs || 3000,
    destructive: !!p.destructive,
  };
}

function validateEvent(state: WorkTrackerCanonicalState, event: DomainEvent) {
  if (event.type === "SESSION_CREATED") {
    const alreadyActive = state.domain.sessions.activeSessionId !== null;
    if (alreadyActive) {
      // throw new Error('Ya existe una sesión activa.');
      // En una arquitectura real, el validador podría prevenir el evento.
      // Para este workshop, permitimos que el reducer decida.
    }
  }
}

function reduce(state: WorkTrackerCanonicalState, event: DomainEvent): WorkTrackerCanonicalState {
  switch (event.type) {
    case "SESSION_AUTO_CHECKIN_GPS": {
      const current = state.domain.sessions.byId[String(event.sessionId)];
      if (
        current &&
        (current.lifecycle.domainStatus === "ACTIVE_WORK" ||
          current.lifecycle.domainStatus === "CLOSED")
      ) {
        return state;
      }
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        actualStartAtMs: event.actualStartAtMs,
        lifecycle: {
          ...current.lifecycle,
          domainStatus: "ACTIVE_WORK",
          locationConfirmed: true,
        },
      } as any;
      sessions.activeSessionId = event.sessionId;
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
        runtime: {
          ...state.runtime,
          geofence: { ...state.runtime.geofence, lastExitTimestampMs: null },
        },
      });
    }
    case "SESSION_AUTO_CHECKOUT_GPS":
    case "SESSION_AUTO_CHECKOUT_FAILSAFE": {
      const current = state.domain.sessions.byId[String(event.sessionId)];
      if (!current || current.lifecycle.domainStatus === "CLOSED") {
        return state;
      }
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        endAtMs: event.endAtMs,
        lifecycle: { ...current.lifecycle, domainStatus: "CLOSED" },
      } as any;
      sessions.activeSessionId = null;
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
        runtime: {
          ...state.runtime,
          geofence: { ...state.runtime.geofence, lastExitTimestampMs: null },
        },
      });
    }
    case "APP_REHYDRATION_COMPLETED":
      return withDerivedViews({
        ...state,
        meta: {
          ...state.meta,
          bootState: {
            isRehydrating: false,
            lastHydratedAtMs: event.timestampMs,
          },
        },
      });
    case "SETTINGS_REHYDRATED":
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, settings: event.settings },
      });
    case "ONBOARDING_COMPLETED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          settings: { ...state.domain.settings, onboardingCompleted: true },
        },
      });
    case "DISCLAIMER_ACCEPTED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          settings: { ...state.domain.settings, disclaimerAccepted: true },
        },
      });
    case "AUDIT_LOGS_REHYDRATED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          audit: { ...state.domain.audit, auditLogs: event.entries },
        },
      });
    case "SESSIONS_REHYDRATED": {
      const byId: Record<string, SessionRecord> = {};
      const order: number[] = [];
      let activeSessionId: number | null = null;

      event.sessions.forEach((s) => {
        byId[String(s.id)] = s;
        order.push(s.id);
        if (
          !s.lifecycle.isDeleted &&
          (s.lifecycle.domainStatus === "ACTIVE_WORK" ||
            s.lifecycle.domainStatus === "TRAVEL" ||
            s.lifecycle.domainStatus === "GEOFENCE_CREATED")
        ) {
          activeSessionId = s.id;
        }
      });

      order.sort((a, b) => b - a);

      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          sessions: { byId, order, activeSessionId },
        },
      });
    }
    case "SYSTEM_LOGS_REHYDRATED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          audit: { ...state.domain.audit, systemLogs: event.entries },
        },
      });
    case "PERMISSIONS_LOCATION_UPDATED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          permissions: {
            ...state.runtime.permissions,
            locationForeground: event.foreground,
            locationBackground: event.background,
          },
        },
      });
    case "PERMISSIONS_NOTIFICATIONS_UPDATED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          permissions: {
            ...state.runtime.permissions,
            notifications: event.notifications,
          },
        },
      });
    case "SESSION_CREATED": {
      const record = buildSessionRecordFromEvent(event);
      const sessions = cloneSessionsState(state);
      sessions.byId[String(record.id)] = record;
      sessions.order = [record.id, ...sessions.order];
      sessions.activeSessionId = record.id;
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_DESTINATION_SET": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);

      const newStatus =
        current.lifecycle.domainStatus === "TRAVEL" ||
        current.lifecycle.domainStatus === "PENDING_EXIT_CONFIRMATION"
          ? "GEOFENCE_CREATED"
          : current.lifecycle.domainStatus;

      sessions.byId[String(event.sessionId)] = {
        ...current,
        lifecycle: {
          ...current.lifecycle,
          domainStatus: newStatus,
        },
        destination: {
          ...current.destination,
          address: event.address ?? current.destination.address,
          clientName: event.clientName ?? current.destination.clientName,
          targetLatitude: event.targetLatitude ?? current.destination.targetLatitude,
          targetLongitude: event.targetLongitude ?? current.destination.targetLongitude,
          setupLatitude: event.setupLatitude ?? current.destination.setupLatitude,
          setupLongitude: event.setupLongitude ?? current.destination.setupLongitude,
        },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_TRANSIT_STARTED": {
      const current = ensureSessionExists(state, event.sessionId);
      // Validar transiciones legales
      if (
        current.lifecycle.domainStatus !== "ACTIVE_WORK" &&
        current.lifecycle.domainStatus !== "PENDING_EXIT_CONFIRMATION"
      ) {
        return state;
      }
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        lifecycle: { ...current.lifecycle, domainStatus: "TRAVEL" },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_PAUSED": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        lifecycle: {
          ...current.lifecycle,
          domainStatus: "PAUSED",
          lastPauseStartMs: now(),
        },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_RESUMED": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);
      const pauseStart = current.lifecycle.lastPauseStartMs || now();
      const additionalPausedMs = now() - pauseStart;

      sessions.byId[String(event.sessionId)] = {
        ...current,
        lifecycle: {
          ...current.lifecycle,
          domainStatus: "ACTIVE_WORK",
          lastPauseStartMs: null,
          totalPausedMs: (current.lifecycle.totalPausedMs || 0) + additionalPausedMs,
        },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_ARRIVAL_CONFIRMED_MANUAL": {
      const current = ensureSessionExists(state, event.sessionId);
      // Validar transiciones legales
      if (
        current.lifecycle.domainStatus !== "GEOFENCE_CREATED" &&
        current.lifecycle.domainStatus !== "TRAVEL"
      ) {
        return state;
      }
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        actualStartAtMs: event.actualStartAtMs,
        lifecycle: {
          ...current.lifecycle,
          domainStatus: "ACTIVE_WORK",
          locationConfirmed: true,
        },
      };
      sessions.activeSessionId = event.sessionId;
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
        runtime: {
          ...state.runtime,
          geofence: { ...state.runtime.geofence, lastExitTimestampMs: null },
        },
      });
    }
    case "SESSION_EXIT_DETECTED": {
      const current = ensureSessionExists(state, event.sessionId);
      // Validar que el estado sea compatible para salida (ACTIVE_WORK)
      if (current.lifecycle.domainStatus !== "ACTIVE_WORK") {
        return state;
      }
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          geofence: {
            ...state.runtime.geofence,
            lastExitTimestampMs: event.exitTimestampMs,
          },
        },
      });
    }
    case "SESSION_EXIT_RESOLVED_CONTINUE": {
      const current = ensureSessionExists(state, event.sessionId);
      if (current.lifecycle.domainStatus !== "ACTIVE_WORK") {
        return state;
      }
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          geofence: { ...state.runtime.geofence, lastExitTimestampMs: null },
        },
      });
    }
    case "SESSION_CLOSED_MANUAL": {
      const current = ensureSessionExists(state, event.sessionId);
      if (current.lifecycle.domainStatus === "CLOSED") {
        return state;
      }
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        endAtMs: event.endAtMs,
        lifecycle: { ...current.lifecycle, domainStatus: "CLOSED" },
      };
      sessions.activeSessionId = null;
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
        runtime: {
          ...state.runtime,
          geofence: { ...state.runtime.geofence, lastExitTimestampMs: null },
        },
      });
    }
    case "SESSION_LUNCH_RECORDED": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        lunch: {
          taken: true,
          startAtMs: event.lunchStartAtMs ?? current.lunch.startAtMs,
          endAtMs: event.lunchEndAtMs ?? current.lunch.endAtMs,
          deductedMinutes: event.deductedMinutes ?? current.lunch.deductedMinutes,
        },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_EDITED_MANUAL": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        declaredStartAtMs: event.startTime,
        endAtMs: event.endTime,
        notes: { manualNote: event.note },
        lifecycle: { ...current.lifecycle, isManualEdit: true },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_NOTE_ADDED": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        notes: { manualNote: event.note },
      };
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "SESSION_DELETED_SOFT": {
      const current = ensureSessionExists(state, event.sessionId);
      const sessions = cloneSessionsState(state);
      sessions.byId[String(event.sessionId)] = {
        ...current,
        lifecycle: { ...current.lifecycle, isDeleted: true },
      };
      if (state.domain.sessions.activeSessionId === event.sessionId)
        sessions.activeSessionId = null;
      return withDerivedViews({
        ...state,
        domain: { ...state.domain, sessions },
      });
    }
    case "GEOFENCE_MONITORING_STARTED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          geofence: {
            ...state.runtime.geofence,
            isMonitoring: true,
            taskName: event.taskName,
            monitoredRegion: {
              identifier: event.identifier,
              latitude: event.latitude,
              longitude: event.longitude,
              radiusMeters: event.radiusMeters,
            },
          },
        },
      });
    case "GEOFENCE_MONITORING_STOPPED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          geofence: {
            ...state.runtime.geofence,
            isMonitoring: false,
            monitoredRegion: {
              identifier: null,
              latitude: null,
              longitude: null,
              radiusMeters: null,
            },
            lastExitTimestampMs: null,
          },
        },
      });
    case "BACKGROUND_TASK_REGISTERED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            appTask: {
              ...state.runtime.background.appTask,
              isRegistered: true,
              taskName: event.taskName,
            },
          },
        },
      });
    case "BACKGROUND_TASK_UNREGISTERED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            appTask: {
              ...state.runtime.background.appTask,
              isRegistered: false,
            },
          },
        },
      });
    case "BACKGROUND_TASK_STARTED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            appTask: { ...state.runtime.background.appTask, isRunning: true },
          },
        },
      });
    case "BACKGROUND_TASK_FINISHED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            appTask: { ...state.runtime.background.appTask, isRunning: false },
          },
        },
      });
    case "REPORT_RANGE_SELECTED":
      return withDerivedViews({
        ...state,
        views: {
          ...state.views,
          report: {
            ...state.views.report,
            selectedRange: {
              startAtMs: event.startAtMs,
              endAtMs: event.endAtMs,
              label: event.label,
            },
          },
        },
      });
    case "REPORT_GENERATION_STARTED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            weeklyReport: {
              ...state.runtime.background.weeklyReport,
              generationStatus: "generating",
            },
          },
        },
      });
    case "REPORT_GENERATION_SUCCEEDED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            weeklyReport: {
              ...state.runtime.background.weeklyReport,
              lastGeneratedUri: event.uri,
              generationStatus: "generated",
            },
          },
        },
      });
    case "REPORT_GENERATION_FAILED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            weeklyReport: {
              ...state.runtime.background.weeklyReport,
              generationStatus: "failed",
            },
          },
        },
      });
    case "REPORT_MARKED_AS_WEEKLY_DELIVERED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          background: {
            ...state.runtime.background,
            weeklyReport: {
              ...state.runtime.background.weeklyReport,
              lastReportedWeekId: event.weekId,
            },
          },
        },
      });
    case "ADMIN_ACCESS_VALIDATION_STARTED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          security: {
            ...state.runtime.security,
            adminAccess: {
              ...state.runtime.security.adminAccess,
              validationStatus: "validating",
            },
          },
        },
      });
    case "ADMIN_ACCESS_GRANTED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          security: {
            ...state.runtime.security,
            adminAccess: {
              isUnlocked: true,
              lastValidatedAtMs: event.timestampMs,
              validationStatus: "granted",
            },
          },
        },
      });
    case "ADMIN_ACCESS_DENIED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          security: {
            ...state.runtime.security,
            adminAccess: {
              ...state.runtime.security.adminAccess,
              isUnlocked: false,
              validationStatus: "denied",
            },
          },
        },
      });
    case "ADMIN_ACCESS_LOCKED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          security: {
            ...state.runtime.security,
            adminAccess: {
              isUnlocked: false,
              lastValidatedAtMs: state.runtime.security.adminAccess.lastValidatedAtMs,
              validationStatus: "IDLE",
            },
          },
        },
      });
    case "SYSTEM_ERROR_RECORDED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          audit: {
            ...state.domain.audit,
            systemLogs: [
              ...state.domain.audit.systemLogs,
              {
                ...event.entry,
                id: state.domain.audit.systemLogs.length + 1,
                timestampMs: event.entry.timestampMs ?? 0,
                timestampIso: event.entry.timestampIso ?? "",
                color: event.entry.color ?? "ROJO",
                category: event.entry.category ?? "ERROR",
                severity: event.entry.severity ?? "ERROR",
                message: event.entry.message ?? "Error desconocido",
                metadataJson: event.entry.metadataJson ?? null,
              } as any,
            ],
          },
        },
      });
    case "FEEDBACK_ENQUEUED": {
      const normalized = normalizeFeedbackPayload(event.feedback);
      if (state.runtime.transient.pendingFeedback.some((i) => i.id === normalized.id))
        return withDerivedViews({ ...state });
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          transient: {
            ...state.runtime.transient,
            pendingFeedback: [...state.runtime.transient.pendingFeedback, normalized],
          },
        },
      });
    }
    case "FEEDBACK_DISMISSED":
      return withDerivedViews({
        ...state,
        runtime: {
          ...state.runtime,
          transient: {
            ...state.runtime.transient,
            pendingFeedback: state.runtime.transient.pendingFeedback.filter(
              (i) => i.id !== event.feedbackId,
            ),
          },
        },
      });
    case "SYSTEM_LOG_APPENDED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          audit: {
            ...state.domain.audit,
            systemLogs: [...state.domain.audit.systemLogs, event.entry],
          },
        },
      });
    case "AUDIT_LOG_APPENDED":
      return withDerivedViews({
        ...state,
        domain: {
          ...state.domain,
          audit: {
            ...state.domain.audit,
            auditLogs: [...state.domain.audit.auditLogs, event.entry],
          },
        },
      });
    default:
      return withDerivedViews({ ...state });
  }
}

export function workTrackerReducer(
  state: WorkTrackerCanonicalState,
  event: DomainEvent,
): WorkTrackerCanonicalState {
  validateEvent(state, event);
  return reduce(state, event);
}
