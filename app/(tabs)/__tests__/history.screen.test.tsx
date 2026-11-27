/**
 * Historial (Solicitud 3, history-wireframes §11): HT-1 (HH-2), HT-2 (HH-4),
 * HT-8 (HH-1) y HT-9 (HH-20, fila).
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { selectCalendarHistory, selectComputedSessions, selectHistoryAllRows, selectPeriodSessionRows } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { getWeekEnd, getWeekStart, shiftWeek, weekPeriodId } from "../../../src/utils/dateUtils";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";
import HistoryScreen from "../history";

const mockPush = jest.fn();

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    useNavigation: () => ({ setOptions: jest.fn(), addListener: () => () => undefined }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactNs.useEffect(() => {
        const clean = cb();
        return typeof clean === "function" ? clean : undefined;
      }, [cb]);
    },
  };
});

async function hydrate(): Promise<void> {
  const snapshot = await PersistenceService.loadSnapshot();
  const settings = await SettingsService.load();
  act(() =>
    StoreActions.hydrated({
      sessions: snapshot.sessions,
      sites: snapshot.sites,
      packs: snapshot.packs,
      sharedPackIds: [],
      settings,
      osKillDetected: false,
      hasPin: false,
      pinOrigin: "UNSET",
      nowMs: time.now(),
    }),
  );
}

function renderHistory() {
  return render(
    <ToastProvider>
      <HistoryScreen />
    </ToastProvider>,
  );
}

/** Seis jornadas de 8 h de lunes a sábado: la sexta entra en extra semanal (> 40 h). */
async function heavyWeek(): Promise<number[]> {
  const { siteA } = await seedWorld();
  const cal = selectCalendarHistory(Store.getState());
  const nextWeek = shiftWeek(getWeekStart(time.now(), cal), 1, cal);
  time.travel(nextWeek + 8 * HOUR - time.now());
  const ids: number[] = [];
  for (let d = 0; d < 6; d++) {
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    ids.push(s.id);
    time.travel(24 * HOUR - 8 * HOUR - 10 * 60_000);
  }
  return ids;
}

beforeEach(() => mockPush.mockClear());

describe("Historial", () => {
  test("HT-1 antes de hidratar muestra carga, no el vacío", async () => {
    await seedWorld();
    act(() => StoreActions.bootStarted());
    renderHistory();
    expect(screen.getByLabelText(t("common.loading"))).toBeTruthy();
    expect(screen.queryByText(t("history.empty"))).toBeNull();
  });

  test("HT-2 «Todo» y «Esta semana» dan las mismas horas e importe para la misma jornada", async () => {
    const ids = await heavyWeek();
    await hydrate();
    const state = Store.getState();
    const now = time.now();
    const cal = selectCalendarHistory(state);
    const weekStart = getWeekStart(now, cal);
    const week = new Map(selectPeriodSessionRows(state, weekStart, getWeekEnd(weekStart, cal), now).map((r) => [r.session.id, r]));
    const all = new Map(selectHistoryAllRows(state, now).map((r) => [r.session.id, r]));
    for (const id of ids) {
      expect(all.get(id)?.netMinutes).toBe(week.get(id)?.netMinutes);
      expect(all.get(id)?.grossCents).toBe(week.get(id)?.grossCents);
    }
    // El caso que antes divergía: previewSession no ve la extra semanal de la sexta jornada.
    const sixth = ids[5];
    const preview = selectComputedSessions(state, now).find((c) => c.session.id === sixth)?.preview;
    expect(Math.round((preview?.grossEstimate ?? 0) * 100)).not.toBe(week.get(sixth)?.grossCents);

    renderHistory();
    const weekRowsText = screen.getAllByText(/TRK-/).length;
    fireEvent.press(screen.getByText(t("history.filters.ALL")));
    expect(screen.getAllByText(/TRK-/).length).toBe(weekRowsText);
  });

  test("HT-8 fila → /session/{id}; «Ver reporte» lleva la semana elegida a /report/{periodo}", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    await hydrate();
    renderHistory();
    fireEvent.press(screen.getByText(t("history.sessionId", { id: s.id })));
    expect(mockPush).toHaveBeenCalledWith(`/session/${s.id}`);

    const cal = selectCalendarHistory(Store.getState());
    const current = getWeekStart(time.now(), cal);
    fireEvent.press(screen.getByTestId("history-period-report"));
    expect(mockPush).toHaveBeenLastCalledWith(`/report/${weekPeriodId(current, cal)}`);
    fireEvent.press(screen.getByLabelText(t("a11y.prevWeek")));
    fireEvent.press(screen.getByTestId("history-period-report"));
    expect(mockPush).toHaveBeenLastCalledWith(`/report/${weekPeriodId(shiftWeek(current, -1, cal), cal)}`);
  });

  test("HT-9 la fila de una jornada cancelada lo dice", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await mustDispatch({ type: "CANCEL_DAY" });
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.cancelled).toBe(true);
    await hydrate();
    renderHistory();
    expect(screen.getByTestId(`session-cancelled-${s.id}`)).toBeTruthy();
    expect(screen.getByText(t("history.cancelled"))).toBeTruthy();
  });
});
