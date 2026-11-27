/**
 * Hoy (Solicitud 3, home-wireframes §11): T-2 (H-4), T-3 (H-5), T-6 (H-6),
 * T-7 (H-2b) y T-8 (H-17).
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { selectActiveElapsedMs, selectLunchElapsedMs } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { routeIntent } from "../../../src/services/application/intentRouter";
import { SessionEngineService } from "../../../src/services/domain/SessionEngineService";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { KV_KEYS } from "../../../src/services/persistence/schema";
import { TaskOrchestratorService } from "../../../src/services/runtime/TaskOrchestratorService";
import { touchHeartbeat } from "../../../src/services/runtime/heartbeat";
import { runSessionWatchdog } from "../../../src/services/runtime/tasks/sessionWatchdog.task";
import { formatTime } from "../../../src/utils/dateUtils";
import { HOUR, MIN } from "../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeExit } from "../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { LocationMock } from "../../../test/runtimeHarness";
import { time } from "../../../test/time";
import TodayScreen from "../index";

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactNs.useEffect(() => {
        const clean = cb();
        return typeof clean === "function" ? clean : undefined;
      }, [cb]);
    },
  };
});

function renderToday() {
  return render(
    <ToastProvider>
      <TodayScreen />
    </ToastProvider>,
  );
}

afterEach(() => TaskOrchestratorService.cancelExitDecision(0));

describe("Hoy · H-4 supervisor de almuerzo (T-2)", () => {
  test("con un LUNCH real el supervisor cuenta desde lunch.startAtMs y el cronómetro del hero se para", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(4 * HOUR);
    expect((await routeIntent({ type: "START_LUNCH" })).ok).toBe(true);
    const atLunch = selectActiveElapsedMs(Store.getState(), time.now());
    time.travel(20 * MIN);
    expect(selectLunchElapsedMs(Store.getState(), time.now())).toBe(20 * MIN);
    // El almuerzo en curso no suma al cronómetro.
    expect(selectActiveElapsedMs(Store.getState(), time.now())).toBe(atLunch);
    time.travel(15 * MIN);
    expect((await routeIntent({ type: "RESUME" })).ok).toBe(true);
    time.travel(10 * MIN);
    // Almuerzo de 35 min (≥ 30): se descuenta entero.
    expect(selectActiveElapsedMs(Store.getState(), time.now())).toBe(atLunch + 10 * MIN);
    expect(selectLunchElapsedMs(Store.getState(), time.now())).toBe(0);
  });
});

describe("Hoy · H-5 banner de cierre automático (T-3)", () => {
  test("al mostrarse borra la clave KV; tocarlo lo descarta", async () => {
    await seedWorld();
    await PersistenceService.setKv(KV_KEYS.AUTO_CLOSE_BANNER, "Cerrada sola a las 12 h");
    act(() => StoreActions.uiRequest({ autoCloseBanner: "Cerrada sola a las 12 h" }));
    renderToday();
    expect(screen.getByText("Cerrada sola a las 12 h")).toBeTruthy();
    // El siguiente arranque (boot.ts lee esta clave) ya no lo vuelve a mostrar.
    await waitFor(async () => expect(await PersistenceService.getKv(KV_KEYS.AUTO_CLOSE_BANNER)).toBeNull());
    fireEvent.press(screen.getByText("Cerrada sola a las 12 h"));
    await act(async () => {});
    await waitFor(() => expect(screen.queryByText("Cerrada sola a las 12 h")).toBeNull());
  });
});

describe("Hoy · H-6 jornada huérfana (T-6)", () => {
  test("el pie no ofrece cerrar (CLOSE_DAY se rechazaría) y lleva a la revisión", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(50 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await runSessionWatchdog();
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.integrityReason).toBe("ORPHAN_SESSION");
    const dispatch = jest.spyOn(SessionEngineService, "dispatch");
    renderToday();
    expect(screen.queryByText(t("cta.closeDay"))).toBeNull();
    expect(screen.getByText(t("today.orphanTitle"))).toBeTruthy();
    fireEvent.press(screen.getAllByText(t("today.orphanReviewCta"))[0]);
    await act(async () => {});
    expect(dispatch.mock.calls.some(([i]) => i.type === "CLOSE_DAY")).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    dispatch.mockRestore();
  });
});

describe("Hoy · H-2b texto de EXTEND (T-7)", () => {
  async function openExtend(caDoubleTime: boolean) {
    await seedWorld();
    const settings = Store.getState().settings;
    act(() => {
      StoreActions.settingsReplaced({ ...settings, company: { ...settings.company, payrollLegalFlags: { ...settings.company.payrollLegalFlags, caDoubleTime } } });
      StoreActions.uiRequest({ openExtendConfirm: true });
    });
    renderToday();
  }
  test("sin caDoubleTime (por defecto) no promete pago doble", async () => {
    await openExtend(false);
    expect(screen.getByText(t("today.extendBody"))).toBeTruthy();
    expect(screen.queryByText(t("today.extendBodyDoubleTime"))).toBeNull();
    expect(t("today.extendBody")).not.toMatch(/2×|doble/);
  });
  test("con caDoubleTime sí lo dice", async () => {
    await openExtend(true);
    expect(screen.getByText(t("today.extendBodyDoubleTime"))).toBeTruthy();
  });
});

describe("Hoy · H-17 hora de nueva revisión (T-8)", () => {
  test("la hoja EXIT usa el plazo guardado (programación + exitDecisionWindowMs), no firstExit + 15 min", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const firstExit = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: firstExit }) }, "GEOFENCE");
    const deadlineMs = firstExit + 5 * MIN + 30 * MIN;
    await PersistenceService.setKv(KV_KEYS.EXIT_DECISION, { sessionId: s.id, firstExitAtMs: firstExit, deadlineMs });
    renderToday();
    fireEvent.press(screen.getAllByText(t("cta.confirmExit"))[0]);
    await waitFor(() => expect(screen.getByText(new RegExp(formatTime(deadlineMs)))).toBeTruthy());
    expect(screen.queryByText(new RegExp(formatTime(firstExit + 15 * MIN)))).toBeNull();
  });

  test("sin plazo guardado usa firstExit + exitDecisionWindowMs; «Cómo funciona» cita la ventana real", async () => {
    const { siteA } = await seedWorld();
    const settings = Store.getState().settings;
    act(() => StoreActions.settingsReplaced({ ...settings, company: { ...settings.company, exitDecisionWindowMs: 25 * MIN } }));
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const firstExit = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: firstExit }) }, "GEOFENCE");
    await PersistenceService.deleteKv(KV_KEYS.EXIT_DECISION);
    renderToday();
    fireEvent.press(screen.getAllByText(t("cta.confirmExit"))[0]);
    await waitFor(() => expect(screen.getByText(new RegExp(formatTime(firstExit + 25 * MIN)))).toBeTruthy());
    expect(t("today.trustFull", { minutes: 25 })).toContain("25");
    expect(t("today.trustFull", { minutes: 25 })).not.toContain("15");
  });
});
