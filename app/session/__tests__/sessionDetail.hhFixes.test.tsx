/**
 * Detalle de sesión (Solicitud 3, history-wireframes §11): HT-4 (HH-5),
 * HT-5 (HH-6), HT-6 (HH-7) y HT-9 (HH-20, detalle).
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { selectCalendarHistory } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { routeIntent } from "../../../src/services/application/intentRouter";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { getWeekEnd, getWeekStart, toHHmm } from "../../../src/utils/dateUtils";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";
import SessionDetailScreen from "../[id]";

const mockParams: Record<string, string> = {};

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  function Stack() {
    return null;
  }
  Stack.Screen = function Screen() {
    return null;
  };
  return {
    Stack,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => mockParams,
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

function renderDetail(id: number) {
  mockParams.id = String(id);
  return render(
    <ToastProvider>
      <SessionDetailScreen />
    </ToastProvider>,
  );
}

async function closedDay() {
  const { siteA } = await seedWorld();
  const s = await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  return s;
}

describe("Detalle de sesión", () => {
  test("HT-4 ADD_NOTE dos veces sustituye la primera; el detalle avisa antes", async () => {
    const s = await closedDay();
    expect((await routeIntent({ type: "ADD_NOTE", sessionId: s.id, note: "primera nota" })).ok).toBe(true);
    expect((await routeIntent({ type: "ADD_NOTE", sessionId: s.id, note: "segunda nota" })).ok).toBe(true);
    // Comportamiento del motor (sin cambio): solo queda la última.
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.manualNote).toBe("segunda nota");
    await hydrate();
    renderDetail(s.id);
    fireEvent.press(screen.getByText(t("session.addNote")));
    expect(screen.getByTestId("note-replaces").props.children).toBe(t("modals.noteReplaces", { note: "segunda nota" }));
  });

  test("HT-4 sin nota previa no hay aviso", async () => {
    const s = await closedDay();
    await hydrate();
    renderDetail(s.id);
    fireEvent.press(screen.getByText(t("session.addNote")));
    expect(screen.queryByTestId("note-replaces")).toBeNull();
  });

  test("HT-5 en una jornada abierta Editar no ofrece fin y corrige solo la entrada", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    await hydrate();
    renderDetail(s.id);
    fireEvent.press(screen.getByText(t("common.edit")));
    expect(screen.queryByTestId("edit-end")).toBeNull();
    expect(screen.getByTestId("edit-open-hint")).toBeTruthy();
    const start = s.actualStartAtMs ?? s.declaredStartAtMs;
    const earlier = start - 30 * 60_000;
    fireEvent.changeText(screen.getByTestId("edit-start"), toHHmm(earlier));
    fireEvent.changeText(screen.getByTestId("edit-note"), "entré antes");
    fireEvent.press(screen.getByText(t("common.save")));
    await waitFor(async () => expect((await PersistenceService.getSession(s.id))?.bookkeeping.manualNote).toBe("entré antes"));
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.endAtMs).toBeNull();
    expect(after.domainStatus).toBe("ACTIVA");
  });

  test("HT-6 editar o eliminar en un periodo con expediente sellado avisa (sin bloquear)", async () => {
    const s = await closedDay();
    const cal = selectCalendarHistory(Store.getState());
    const periodStart = getWeekStart(time.now(), cal);
    expect((await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd: getWeekEnd(periodStart, cal) })).ok).toBe(true);
    await hydrate();
    renderDetail(s.id);
    fireEvent.press(screen.getByText(t("common.edit")));
    expect(screen.getByTestId("edit-sealed-warning")).toBeTruthy();
    fireEvent.press(screen.getByText(t("common.cancel")));
    fireEvent.press(screen.getAllByText(t("common.delete"))[0]);
    expect(screen.getByText(`${t("modals.deleteBody")}\n\n${t("modals.sealedPeriodWarning")}`)).toBeTruthy();
    // Avisa, no bloquea: el motor sigue aceptando el borrado (queda en el libro).
    expect((await routeIntent({ type: "DELETE_SESSION", sessionId: s.id })).ok).toBe(true);
  });

  test("HT-6 sin expediente sellado no hay aviso", async () => {
    const s = await closedDay();
    await hydrate();
    renderDetail(s.id);
    fireEvent.press(screen.getByText(t("common.edit")));
    expect(screen.queryByTestId("edit-sealed-warning")).toBeNull();
  });

  test("HT-9 el detalle de una jornada cancelada no dice «cerrada»", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await mustDispatch({ type: "CANCEL_DAY" });
    await hydrate();
    renderDetail(s.id);
    expect(screen.getByText(new RegExp(t("history.cancelled").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
    expect(screen.queryByText(new RegExp(t("states.CERRADA.label")))).toBeNull();
  });
});
