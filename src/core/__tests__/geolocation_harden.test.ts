import { now } from "../../utils/timeProvider";
import { workTrackerEngine } from "../workTrackerEngine";

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

const mockRuntime = {
  sessionStore: {
    createSession: jest.fn().mockResolvedValue(undefined),
    updateSessionManual: jest.fn().mockResolvedValue(undefined),
    closeSession: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockResolvedValue(null),
    getAuditLogs: jest.fn().mockResolvedValue([]),
  },
  location: {
    startMonitoringArrival: jest.fn().mockResolvedValue(true),
    stopMonitoring: jest.fn().mockResolvedValue(undefined),
    clearLastExitTimestamp: jest.fn().mockResolvedValue(undefined),
    setLastExitTimestamp: jest.fn().mockResolvedValue(undefined),
  },
  notifications: {
    notifyImmediate: jest.fn().mockResolvedValue(undefined),
  },
  reports: {},
  security: {},
  logging: {
    appendAuditLog: jest.fn().mockResolvedValue(undefined),
    appendSystemLog: jest.fn().mockResolvedValue(undefined),
    getAuditLogs: jest.fn().mockResolvedValue([]),
  },
};

describe("Geolocation Hardening and Idempotency", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    workTrackerEngine.resetState();
    workTrackerEngine.initialize(mockRuntime as any);
  });

  it("no debe permitir duplicar un Auto Check-in si la sesión ya está activa", async () => {
    const startTime = now();

    // 1. Crear sesión
    await workTrackerEngine.dispatch({
      type: "SESSION_CREATED",
      session: {
        id: 100,
        declaredStartAtMs: startTime,
        domainStatus: "GEOFENCE_CREATED",
      },
    } as any);

    // 2. Primer Check-in (válido)
    await workTrackerEngine.dispatch({
      type: "SESSION_AUTO_CHECKIN_GPS",
      sessionId: 100,
      actualStartAtMs: startTime + 1000,
    });

    let state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["100"].lifecycle.domainStatus).toBe("ACTIVE_WORK");
    expect(state.domain.sessions.activeSessionId).toBe(100);

    // 3. Segundo Check-in (debe ser ignorado por el reducer/validateEvent)
    await workTrackerEngine.dispatch({
      type: "SESSION_AUTO_CHECKIN_GPS",
      sessionId: 100,
      actualStartAtMs: startTime + 2000,
    });

    state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["100"].actualStartAtMs).toBe(startTime + 1000); // Mantiene el primero
  });

  it("no debe permitir Auto Check-in si la sesión ya está completada", async () => {
    const startTime = now();

    await workTrackerEngine.dispatch({
      type: "SESSION_CREATED",
      session: {
        id: 101,
        declaredStartAtMs: startTime,
        domainStatus: "GEOFENCE_CREATED",
      },
    } as any);

    // Cerrar sesión
    await workTrackerEngine.dispatch({
      type: "SESSION_CLOSED_MANUAL",
      sessionId: 101,
      endAtMs: startTime + 5000,
    });

    let state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["101"].lifecycle.domainStatus).toBe("CLOSED");

    // Intentar Auto Check-in
    await workTrackerEngine.dispatch({
      type: "SESSION_AUTO_CHECKIN_GPS",
      sessionId: 101,
      actualStartAtMs: startTime + 6000,
    });

    state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["101"].lifecycle.domainStatus).toBe("CLOSED");
  });

  it("no debe permitir duplicar Auto Check-out si ya está completada", async () => {
    const startTime = now();

    await workTrackerEngine.dispatch({
      type: "SESSION_CREATED",
      session: {
        id: 102,
        declaredStartAtMs: startTime,
        domainStatus: "ACTIVE_WORK",
      },
    } as any);

    // Primer Check-out
    await workTrackerEngine.dispatch({
      type: "SESSION_AUTO_CHECKOUT_GPS",
      sessionId: 102,
      endAtMs: startTime + 10000,
    });

    let state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["102"].lifecycle.domainStatus).toBe("CLOSED");

    // Segundo Check-out
    await workTrackerEngine.dispatch({
      type: "SESSION_AUTO_CHECKOUT_GPS",
      sessionId: 102,
      endAtMs: startTime + 20000,
    });

    state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["102"].endAtMs).toBe(startTime + 10000); // Mantiene el primero
  });
});
