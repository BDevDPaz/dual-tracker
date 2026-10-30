import { WorkTrackerCanonicalState } from "../contracts";

export const createInitialState = (): WorkTrackerCanonicalState => ({
  meta: {
    schemaVersion: 1,
    timezone: "America/Los_Angeles",
    locale: "es",
    bootState: {
      isRehydrating: true,
      lastHydratedAtMs: null,
    },
  },
  domain: {
    sessions: {
      byId: {},
      order: [],
      activeSessionId: null,
    },
    settings: {
      employeeName: "Empleado Nuevo",
      employerName: "LEON'S ELECTRICAL DESIGN",
      companyEmail: "",
      toleranceRadiusMeters: 200,
      hourlyRate: 25.0,
      language: "es",
      dailyReminderTime: "07:00",
      overtimeMultiplier: 1.5,
      onboardingCompleted: false,
      disclaimerAccepted: false,
    },
    audit: {
      auditLogs: [],
      systemLogs: [],
    },
  },
  runtime: {
    permissions: {
      locationForeground: "unknown",
      locationBackground: "unknown",
      notifications: "unknown",
    },
    geofence: {
      isMonitoring: false,
      taskName: "",
      lastExitTimestampMs: null,
      monitoredRegion: {
        identifier: null,
        latitude: null,
        longitude: null,
        radiusMeters: null,
      },
    },
    background: {
      appTask: {
        isRegistered: false,
        isRunning: false,
        taskName: "",
      },
      weeklyReport: {
        lastReportedWeekId: null,
        lastGeneratedUri: null,
        generationStatus: "IDLE",
      },
    },
    notifications: {
      defaultChannelReady: false,
      lastScheduledReminderTime: null,
    },
    security: {
      adminAccess: {
        isUnlocked: false,
        lastValidatedAtMs: null,
        validationStatus: "IDLE",
      },
    },
    transient: {
      pendingFeedback: [],
      draftNotesBySessionId: {},
      exportIntent: {
        shouldShareAfterGenerate: false,
        shouldSendByEmailAfterGenerate: false,
      },
    },
  },
  views: {
    currentOperationalState: {
      engineState: "IDLE",
    },
    selectedSession: {
      selectedSessionId: null,
    },
    history: {
      activeFilter: "Todos",
    },
    report: {
      selectedRange: {
        startAtMs: null,
        endAtMs: null,
        label: null,
      },
    },
  },
});
