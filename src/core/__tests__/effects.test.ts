import { executeEffects } from "../effects";
import { createInitialState } from "../state";
import { workTrackerReducer } from "../reducer";
import { DomainEvent, WorkTrackerCanonicalState } from "../contracts";

jest.mock("../runtime/sessionStoreAdapter", () => ({
  loadSessionRecordsSnapshot: jest.fn().mockResolvedValue([]),
  loadSystemLogRecordsSnapshot: jest.fn().mockResolvedValue([]),
}));

describe("effects", () => {
  const mockRuntime: any = {
    location: {
      startMonitoringArrival: jest.fn(),
      stopMonitoring: jest.fn(),
      clearLastExitTimestamp: jest.fn(),
      setLastExitTimestamp: jest.fn(),
    },
    logging: {
      appendAuditLog: jest.fn(),
      appendSystemLog: jest.fn(),
      mapLogToFeedback: jest.fn(() => null),
    },
    sessionStore: {
      createSession: jest.fn(),
      updateSessionManual: jest.fn(),
      closeSession: jest.fn(),
      deleteSession: jest.fn(),
      updateLunch: jest.fn(),
      confirmArrival: jest.fn(),
      updateStatus: jest.fn(),
      checkOverlap: jest.fn(),
      getSettings: jest.fn(),
      getAuditLogs: jest.fn(),
      saveSettings: jest.fn(),
    },
    notifications: {
      notifyImmediate: jest.fn(),
    },
    reports: {
      sharePdf: jest.fn(),
      sendByEmail: jest.fn(),
    },
    security: {
      validateAdminPin: jest.fn(),
    },
  };

  const getNonRehydratingState = (): WorkTrackerCanonicalState => {
    const state = createInitialState();
    state.meta.bootState.isRehydrating = false;
    return state;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRuntime.sessionStore.checkOverlap.mockResolvedValue(false);
  });

  it("SESSION_CREATED debe disparar monitoreo y detección de solapamiento", async () => {
    const prevState = getNonRehydratingState();
    const event: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
        destination: { targetLatitude: 10, targetLongitude: 20 } as any,
      },
    };

    const nextState = workTrackerReducer(prevState, event);
    mockRuntime.sessionStore.checkOverlap.mockResolvedValue(true);

    const secondaryEvents = await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.sessionStore.createSession).toHaveBeenCalled();
    expect(mockRuntime.sessionStore.checkOverlap).toHaveBeenCalledWith(1000, 0, 1);
    expect(secondaryEvents).toContainEqual(
      expect.objectContaining({
        type: "SESSION_OVERLAP_DETECTED",
        sessionId: 1,
      }),
    );
    expect(secondaryEvents).toContainEqual(
      expect.objectContaining({
        type: "GEOFENCE_MONITORING_STARTED",
      }),
    );
  });

  it("SESSION_DESTINATION_SET debe disparar GEOFENCE_MONITORING_STARTED si el estado lo permite", async () => {
    const initialState = getNonRehydratingState();
    const createEvent: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
      },
    };

    let prevState = workTrackerReducer(initialState, createEvent);

    const event: DomainEvent = {
      type: "SESSION_DESTINATION_SET",
      sessionId: 1,
      targetLatitude: 10,
      targetLongitude: 20,
    };

    const nextState = workTrackerReducer(prevState, event);

    const secondaryEvents = await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.location.startMonitoringArrival).toHaveBeenCalledWith(
      "WORK_ZONE",
      10,
      20,
      nextState.domain.settings.toleranceRadiusMeters,
    );
    expect(secondaryEvents).toContainEqual(
      expect.objectContaining({
        type: "GEOFENCE_MONITORING_STARTED",
        latitude: 10,
        longitude: 20,
      }),
    );
  });

  it("SESSION_AUTO_CHECKIN_GPS debe actualizar DB, notificar y limpiar AsyncStorage", async () => {
    const initialState = getNonRehydratingState();
    const createEvent: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
      },
    };

    let prevState = workTrackerReducer(initialState, createEvent);

    const event: DomainEvent = {
      type: "SESSION_AUTO_CHECKIN_GPS",
      sessionId: 1,
      actualStartAtMs: 2000,
    };

    const nextState = workTrackerReducer(prevState, event);

    await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.sessionStore.confirmArrival).toHaveBeenCalledWith(1, 2000);
    expect(mockRuntime.location.clearLastExitTimestamp).toHaveBeenCalled();
    expect(mockRuntime.notifications.notifyImmediate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ action: "AUTO_CHECKIN_GPS" }),
    );
  });

  it("SESSION_AUTO_CHECKOUT_GPS debe cerrar sesión en DB, parar monitoreo y notificar", async () => {
    const initialState = getNonRehydratingState();
    const createEvent: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
      },
    };
    let state = workTrackerReducer(initialState, createEvent);

    const checkinEvent: DomainEvent = {
      type: "SESSION_AUTO_CHECKIN_GPS",
      sessionId: 1,
      actualStartAtMs: 1500,
    };
    let prevState = workTrackerReducer(state, checkinEvent);

    const event: DomainEvent = {
      type: "SESSION_AUTO_CHECKOUT_GPS",
      sessionId: 1,
      endAtMs: 5000,
    };
    const nextState = workTrackerReducer(prevState, event);

    await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.sessionStore.closeSession).toHaveBeenCalledWith(1, 5000);
    expect(mockRuntime.location.stopMonitoring).toHaveBeenCalled();
    expect(mockRuntime.notifications.notifyImmediate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ action: "AUTO_CHECKOUT_GPS" }),
    );
  });

  it("SESSION_EDITED_MANUAL debe detectar solapamiento", async () => {
    const initialState = getNonRehydratingState();
    const createEvent: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
      },
    };
    let prevState = workTrackerReducer(initialState, createEvent);

    const event: DomainEvent = {
      type: "SESSION_EDITED_MANUAL",
      sessionId: 1,
      startTime: 5000,
      endTime: 6000,
      note: "test",
    };
    const nextState = workTrackerReducer(prevState, event);

    mockRuntime.sessionStore.checkOverlap.mockResolvedValue(true);

    const secondaryEvents = await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.sessionStore.checkOverlap).toHaveBeenCalledWith(5000, 6000, 1);
    expect(secondaryEvents).toContainEqual(
      expect.objectContaining({
        type: "SESSION_OVERLAP_DETECTED",
        sessionId: 1,
      }),
    );
  });

  it("SESSION_OVERLAP_DETECTED debe notificar y registrar log", async () => {
    const state = getNonRehydratingState();
    const event: DomainEvent = {
      type: "SESSION_OVERLAP_DETECTED",
      sessionId: 1,
    };

    const secondaryEvents = await executeEffects(event, state, state, mockRuntime);

    expect(mockRuntime.notifications.notifyImmediate).toHaveBeenCalledWith(
      expect.stringContaining("Solapamiento"),
      expect.any(String),
      expect.objectContaining({ action: "SESSION_OVERLAP_DETECTED" }),
    );
    expect(secondaryEvents).toContainEqual(
      expect.objectContaining({
        type: "SYSTEM_LOG_APPENDED",
      }),
    );
  });
  it("debe persistir settings al completar onboarding", async () => {
    const prevState = getNonRehydratingState();
    const event: DomainEvent = { type: "ONBOARDING_COMPLETED" };
    const nextState = workTrackerReducer(prevState, event);

    await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.sessionStore.saveSettings).toHaveBeenCalledWith(nextState.domain.settings);
  });

  it("debe persistir settings al aceptar disclaimer", async () => {
    const prevState = getNonRehydratingState();
    const event: DomainEvent = { type: "DISCLAIMER_ACCEPTED" };
    const nextState = workTrackerReducer(prevState, event);

    await executeEffects(event, prevState, nextState, mockRuntime);

    expect(mockRuntime.sessionStore.saveSettings).toHaveBeenCalledWith(nextState.domain.settings);
  });
});
