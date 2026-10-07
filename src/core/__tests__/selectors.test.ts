/** Core — selectors e initialState: sesión borrada no es activa; hidratando no hay tabs. */
import { Store, StoreActions } from "../store";
import { createInitialState } from "../store/initialState";
import {
  selectActiveSession,
  selectHasConflict,
  selectIsHydrated,
  selectNeedsDisclaimer,
  selectSessionState,
  selectSiteLastVisitAtMs,
  selectTodaySummary,
  selectVisibleSessions,
} from "../selectors";
import { DISCLOSURE_VERSION } from "../../i18n/legal";
import { DEFAULT_COMPANY_POLICY, DEFAULT_DEVICE_PREFS, DEFAULT_PROFILE } from "../../services/persistence/SettingsService";
import { HOUR, MONDAY_8AM, makeClosedSession, makeSegment, makeSession } from "../../../test/fixtures/session.fixture";

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

  test("última visita sale de las sesiones vivas, no de un campo congelado", () => {
    const st = hydrate([
      makeSession({ id: 1, siteId: 4, declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM }),
      makeSession({ id: 2, siteId: 4, declaredStartAtMs: MONDAY_8AM + HOUR, actualStartAtMs: MONDAY_8AM + HOUR }),
      makeSession({ id: 3, siteId: 9, declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM }),
      makeSession({ id: 5, siteId: 4, declaredStartAtMs: MONDAY_8AM + 5 * HOUR, actualStartAtMs: MONDAY_8AM + 5 * HOUR, bookkeeping: { isDeleted: true } }),
    ]);
    expect(selectSiteLastVisitAtMs(st, 4)).toBe(MONDAY_8AM + HOUR);
    expect(selectSiteLastVisitAtMs(st, 9)).toBe(MONDAY_8AM);
    expect(selectSiteLastVisitAtMs(st, 1)).toBeNull();
  });

  test("Destinos de hoy conserva el origen después de llegar, y el destino mientras se va en camino", () => {
    const arrived = hydrate([
      makeSession({
        id: 1,
        siteId: 2,
        transitSegments: [makeSegment({ fromSiteId: 1, toSiteId: 2, startAtMs: MONDAY_8AM + HOUR, endAtMs: MONDAY_8AM + 2 * HOUR })],
      }),
    ]);
    expect(selectTodaySummary(arrived, MONDAY_8AM + 3 * HOUR).visitedSiteIds).toEqual([1, 2]);

    const enRoute = hydrate([
      makeSession({
        id: 1,
        siteId: 1,
        domainStatus: "TRASLADO",
        transitSegments: [makeSegment({ fromSiteId: 1, toSiteId: 2, endAtMs: null })],
      }),
    ]);
    expect(selectTodaySummary(enRoute, MONDAY_8AM + HOUR).visitedSiteIds).toEqual([1, 2]);
  });

  test("cerrar en pleno traslado no marca el destino como visitado", () => {
    const end = MONDAY_8AM + 4 * HOUR;
    const st = hydrate([
      makeClosedSession(MONDAY_8AM, 4, {
        siteId: 1,
        transitSegments: [makeSegment({ fromSiteId: 1, toSiteId: 2, startAtMs: MONDAY_8AM + 3 * HOUR, endAtMs: end })],
      }),
    ]);
    expect(selectTodaySummary(st, end).visitedSiteIds).toEqual([1]);
  });

  test("la jornada abierta sigue en Destinos de hoy después de medianoche", () => {
    const st = hydrate([makeSession({ id: 1, siteId: 7, domainStatus: "ACTIVA" })]);
    expect(selectTodaySummary(st, MONDAY_8AM + 24 * HOUR).visitedSiteIds).toEqual([7]);
  });

  test("última visita del origen es el inicio; la del destino, la llegada", () => {
    const st = hydrate([
      makeClosedSession(MONDAY_8AM, 8, {
        id: 1,
        siteId: 2,
        transitSegments: [makeSegment({ fromSiteId: 4, toSiteId: 2, startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 3 * HOUR })],
      }),
    ]);
    expect(selectSiteLastVisitAtMs(st, 4)).toBe(MONDAY_8AM);
    expect(selectSiteLastVisitAtMs(st, 2)).toBe(MONDAY_8AM + 3 * HOUR);
  });

  test("conflictos y aviso pendiente", () => {
    const st = hydrate([makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT" })], false);
    expect(selectHasConflict(st)).toBe(true);
    expect(selectNeedsDisclaimer(st)).toBe(true);
  });
});
