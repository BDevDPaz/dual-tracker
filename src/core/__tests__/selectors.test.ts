/** Core — selectors e initialState: sesión borrada no es activa; hidratando no hay tabs. */
import { Store, StoreActions } from "../store";
import { createInitialState } from "../store/initialState";
import {
  selectActiveSession,
  selectHasConflict,
  selectIsHydrated,
  selectNeedsDisclaimer,
  selectSessionState,
  selectVisibleSessions,
} from "../selectors";
import { DISCLOSURE_VERSION } from "../../i18n/legal";
import { DEFAULT_COMPANY_POLICY, DEFAULT_DEVICE_PREFS, DEFAULT_PROFILE } from "../../services/persistence/SettingsService";
import { HOUR, MONDAY_8AM, makeClosedSession, makeSession } from "../../../test/fixtures/session.fixture";

function hydrate(sessions: ReturnType<typeof makeSession>[], accepted = true) {
  StoreActions.hydrated({
    sessions,
    sites: [],
    packs: [],
    settings: { profile: DEFAULT_PROFILE, company: DEFAULT_COMPANY_POLICY, device: { ...DEFAULT_DEVICE_PREFS, disclosureAcceptedVersion: accepted ? DISCLOSURE_VERSION : null } },
    osKillDetected: false,
    hasPin: false,
    nowMs: MONDAY_8AM,
  });
  return Store.getState();
}

describe("selectors", () => {
  test("mientras hidrata no hay tabs (isHydrated=false)", () => {
    expect(selectIsHydrated(createInitialState())).toBe(false);
    expect(selectIsHydrated(hydrate([]))).toBe(true);
  });

  test("sesión borrada no es activa ni visible", () => {
    const st = hydrate([makeSession({ id: 1, bookkeeping: { isDeleted: true } })]);
    expect(selectActiveSession(st)).toBeNull();
    expect(selectVisibleSessions(st)).toHaveLength(0);
    expect(selectSessionState(st, MONDAY_8AM)).toBe("NO_INICIADA");
  });

  test("sesión abierta es la activa; cerrada hoy → CERRADA", () => {
    expect(selectActiveSession(hydrate([makeSession({ id: 2 })]))?.id).toBe(2);
    const st = hydrate([makeClosedSession(MONDAY_8AM, 8, { id: 3 })]);
    expect(selectSessionState(st, MONDAY_8AM + 9 * HOUR)).toBe("CERRADA");
  });

  test("conflictos y aviso pendiente", () => {
    const st = hydrate([makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT" })], false);
    expect(selectHasConflict(st)).toBe(true);
    expect(selectNeedsDisclaimer(st)).toBe(true);
  });
});
