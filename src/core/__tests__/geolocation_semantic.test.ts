import { now } from "../../utils/timeProvider";
import { workTrackerEngine } from "../workTrackerEngine";

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

describe("Geolocation Semantic Checkout", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    workTrackerEngine.resetState();
    workTrackerEngine.initialize(mockRuntime as any);
  });

  it("debe procesar SESSION_AUTO_CHECKOUT_FAILSAFE y cerrar la sesión", async () => {
    const startTime = now();

    // 1. Crear sesión activa
    await workTrackerEngine.dispatch({
      type: "SESSION_CREATED",
      session: {
        id: 200,
        declaredStartAtMs: startTime,
        domainStatus: "ACTIVE_WORK",
      },
    } as any);

    let state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["200"].lifecycle.domainStatus).toBe("ACTIVE_WORK");

    // 2. Ejecutar Failsafe Checkout
    const endTime = startTime + 1000 * 60 * 30; // 30 mins después
    await workTrackerEngine.dispatch({
      type: "SESSION_AUTO_CHECKOUT_FAILSAFE",
      sessionId: 200,
      endAtMs: endTime,
    });

    state = workTrackerEngine.getState();
    expect(state.domain.sessions.byId["200"].lifecycle.domainStatus).toBe("CLOSED");
    expect(state.domain.sessions.byId["200"].endAtMs).toBe(endTime);
    expect(state.domain.sessions.activeSessionId).toBe(null);
  });
});
