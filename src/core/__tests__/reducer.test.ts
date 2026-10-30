import { workTrackerReducer } from "../reducer";
import { createInitialState } from "../state";
import { DomainEvent } from "../contracts";

describe("workTrackerReducer", () => {
  it("debe crear una sesión correctamente", () => {
    const state = createInitialState();

    const event: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
      },
    };

    const nextState = workTrackerReducer(state, event);

    expect(nextState.domain.sessions.byId["1"]).toBeDefined();
    expect(nextState.domain.sessions.activeSessionId).toBe(1);
  });

  it("debe ignorar EVENT_RETRY_REQUESTED (no muta estado)", () => {
    const state = createInitialState();

    const event: DomainEvent = {
      type: "EVENT_RETRY_REQUESTED",
      originalEvent: {
        type: "SESSION_CREATED",
        session: {
          id: 99,
          declaredStartAtMs: 0,
          domainStatus: "GEOFENCE_CREATED",
        },
      },
      retryCount: 1,
      reason: "test",
    };

    const nextState = workTrackerReducer(state, event);

    expect(nextState).toEqual(state);
  });

  it("debe actualizar el destino de una sesión (SESSION_DESTINATION_SET)", () => {
    const initialState = createInitialState();
    const createEvent: DomainEvent = {
      type: "SESSION_CREATED",
      session: {
        id: 1,
        declaredStartAtMs: 1000,
        domainStatus: "GEOFENCE_CREATED",
      },
      address: "Calle Falsa 123",
    };

    let state = workTrackerReducer(initialState, createEvent);

    const setDestEvent: DomainEvent = {
      type: "SESSION_DESTINATION_SET",
      sessionId: 1,
      address: "Nueva Dirección",
      targetLatitude: 40.7128,
      targetLongitude: -74.006,
    };

    state = workTrackerReducer(state, setDestEvent);

    const session = state.domain.sessions.byId["1"];
    expect(session.destination.address).toBe("Nueva Dirección");
    expect(session.destination.targetLatitude).toBe(40.7128);
    expect(session.destination.targetLongitude).toBe(-74.006);
    // Preserva otros campos
    expect(session.declaredStartAtMs).toBe(1000);
  });

  it("debe actualizar el estado de monitoreo de geocerca (GEOFENCE_MONITORING_STARTED)", () => {
    const state = createInitialState();
    const event: DomainEvent = {
      type: "GEOFENCE_MONITORING_STARTED",
      taskName: "TASK_1",
      identifier: "ZONE_1",
      latitude: 10,
      longitude: 20,
      radiusMeters: 300,
    };

    const nextState = workTrackerReducer(state, event);

    expect(nextState.runtime.geofence.isMonitoring).toBe(true);
    expect(nextState.runtime.geofence.taskName).toBe("TASK_1");
    expect(nextState.runtime.geofence.monitoredRegion.identifier).toBe("ZONE_1");
    expect(nextState.runtime.geofence.monitoredRegion.latitude).toBe(10);
    expect(nextState.runtime.geofence.monitoredRegion.longitude).toBe(20);
    expect(nextState.runtime.geofence.monitoredRegion.radiusMeters).toBe(300);
  });

  it("debe limpiar el estado de monitoreo de geocerca (GEOFENCE_MONITORING_STOPPED)", () => {
    let state = createInitialState();
    state.runtime.geofence.isMonitoring = true;
    state.runtime.geofence.monitoredRegion.identifier = "ZONE_1";

    const event: DomainEvent = {
      type: "GEOFENCE_MONITORING_STOPPED",
    };

    const nextState = workTrackerReducer(state, event);

    expect(nextState.runtime.geofence.isMonitoring).toBe(false);
    expect(nextState.runtime.geofence.monitoredRegion.identifier).toBe(null);
  });
});
