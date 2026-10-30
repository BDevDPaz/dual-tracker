import { selectActiveSession, selectComputedSessions } from "../index";
import { createInitialState } from "../../state/initialState";
import { WorkTrackerCanonicalState, SessionRecord } from "../../contracts/types";

describe("Selectors Hardening", () => {
  let state: WorkTrackerCanonicalState;

  beforeEach(() => {
    state = createInitialState();
  });

  describe("selectActiveSession", () => {
    it("should return null if no active session", () => {
      expect(selectActiveSession(state)).toBeNull();
    });

    it("should return the active session if it exists", () => {
      const session: SessionRecord = {
        id: 1,
        declaredStartAtMs: 1000,
        actualStartAtMs: null,
        endAtMs: null,
        lifecycle: {
          domainStatus: "ACTIVE_WORK",
          isDeleted: false,
          isManualEdit: false,
          locationConfirmed: true,
          totalPausedMs: 0,
          lastPauseStartMs: null,
        },
        destination: {
          address: "Test",
          clientName: "Test",
          targetLatitude: 0,
          targetLongitude: 0,
          setupLatitude: 0,
          setupLongitude: 0,
        },
        capturedLocation: {
          latitude: 0,
          longitude: 0,
        },
        lunch: {
          taken: false,
          startAtMs: null,
          endAtMs: null,
          deductedMinutes: null,
        },
        notes: {
          manualNote: null,
        },
        bookkeeping: {
          dateString: "2024-01-01",
        },
      };

      state.domain.sessions.byId["1"] = session;
      state.domain.sessions.activeSessionId = 1;

      expect(selectActiveSession(state)).toEqual(session);
    });

    it("should return null if active session is deleted", () => {
      const session: SessionRecord = {
        id: 1,
        declaredStartAtMs: 1000,
        actualStartAtMs: null,
        endAtMs: null,
        lifecycle: {
          domainStatus: "ACTIVE_WORK",
          isDeleted: true,
          isManualEdit: false,
          locationConfirmed: true,
          totalPausedMs: 0,
          lastPauseStartMs: null,
        },
        destination: {
          address: "Test",
          clientName: "Test",
          targetLatitude: 0,
          targetLongitude: 0,
          setupLatitude: 0,
          setupLongitude: 0,
        },
        capturedLocation: {
          latitude: 0,
          longitude: 0,
        },
        lunch: {
          taken: false,
          startAtMs: null,
          endAtMs: null,
          deductedMinutes: null,
        },
        notes: {
          manualNote: null,
        },
        bookkeeping: {
          dateString: "2024-01-01",
        },
      };

      state.domain.sessions.byId["1"] = session;
      state.domain.sessions.activeSessionId = 1;

      expect(selectActiveSession(state)).toBeNull();
    });
  });

  describe("selectComputedSessions", () => {
    it("should filter out deleted sessions", () => {
      const s1: any = {
        id: 1,
        lifecycle: {
          domainStatus: "ACTIVE_WORK",
          isDeleted: false,
          isManualEdit: false,
          locationConfirmed: true,
          totalPausedMs: 0,
          lastPauseStartMs: null,
        },
        lunch: {},
        destination: {},
      };

      const s2: any = {
        id: 2,
        lifecycle: {
          domainStatus: "ACTIVE_WORK",
          isDeleted: true,
          isManualEdit: false,
          locationConfirmed: true,
          totalPausedMs: 0,
          lastPauseStartMs: null,
        },
        lunch: {},
        destination: {},
      };

      state.domain.sessions.byId = {
        "1": s1,
        "2": s2,
      };
      state.domain.sessions.order = [1, 2];

      const result = selectComputedSessions(state);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });
});
