/**
 * PR3 · Reporte de nómina y Auditoría de jornadas, de punta a punta:
 * Reportes («Vista previa», «Exportar expediente», «Enviar por correo») →
 * vista previa del periodo (/report/[periodId]) con su sección de auditoría →
 * auditoría de la jornada (/session/[id]/audit). También las entradas desde
 * el detalle de sesión y el expediente.
 */
import React from "react";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { selectCalendarHistory } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { getWeekEnd, getWeekStart, weekPeriodId } from "../../../src/utils/dateUtils";
import { generateWeeklyPayroll } from "../../../src/services/application/useCases";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { time } from "../../../test/time";
import ReportsScreen from "../../(tabs)/reports";
import PeriodStatementScreen from "../[periodId]";
import PackScreen from "../pack/[packId]";
import SessionDetailScreen from "../../session/[id]";
import SessionAuditScreen from "../../session/[id]/audit";

const mockPush = jest.fn();
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
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
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

const mail = MailComposer as unknown as { __sent: unknown[] };
const sharing = Sharing as unknown as { __shared: string[] };

async function hydrate(): Promise<void> {
  const snapshot = await PersistenceService.loadSnapshot();
  StoreActions.hydrated({
    sessions: snapshot.sessions,
    sites: snapshot.sites,
    packs: snapshot.packs,
    sharedPackIds: [],
    settings: await SettingsService.load(),
    osKillDetected: false,
    hasPin: false,
    pinOrigin: "UNSET",
    nowMs: time.now(),
  });
}

async function closedDay() {
  const { siteA } = await seedWorld();
  const s = await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  return s;
}

function periodIdNow(): string {
  return weekPeriodId(getWeekStart(time.now(), selectCalendarHistory(Store.getState())), selectCalendarHistory(Store.getState()));
}

function wrap(node: React.ReactElement) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

beforeEach(() => {
  mockPush.mockClear();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  mail.__sent.length = 0;
  sharing.__shared.length = 0;
});

describe("Reportes · Reporte de nómina", () => {
  test("Vista previa navega a /report/[periodId]; Exportar expediente sella y comparte; luego Enviar por correo", async () => {
    await closedDay();
    await hydrate();
    wrap(<ReportsScreen />);
    expect(await screen.findByTestId("payroll-report")).toBeTruthy();
    // Sin expediente sellado no se puede enviar, y se explica por qué.
    expect(screen.getByTestId("payroll-send").props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId("payroll-send-needs-seal").props.children).toBe(t("reports.sendNeedsSeal"));
    // Sin correo de empresa se avisa con enlace a Ajustes.
    fireEvent.press(screen.getByTestId("payroll-no-email"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/settings");

    fireEvent.press(screen.getByTestId("payroll-preview"));
    expect(mockPush).toHaveBeenCalledWith(`/report/${periodIdNow()}`);

    await act(async () => {
      fireEvent.press(screen.getByTestId("payroll-export"));
    });
    await waitFor(() => expect(sharing.__shared.length).toBe(1));
    expect(sharing.__shared[0]).toMatch(/Comprobante|Receipt|\.pdf$/i);
    expect((await PersistenceService.listPacks()).length).toBe(1);

    await waitFor(() => expect(screen.getByTestId("payroll-send").props.accessibilityState?.disabled).toBe(false), { timeout: 3000 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("payroll-send"));
    });
    await waitFor(() => expect(mail.__sent.length).toBe(1));
  });
});

describe("Vista previa del periodo · Auditoría de jornadas", () => {
  test("lista cada jornada con lo registrado y abre su auditoría", async () => {
    const s = await closedDay();
    await hydrate();
    mockParams.periodId = periodIdNow();
    wrap(<PeriodStatementScreen />);
    const row = await screen.findByTestId(`period-audit-${s.id}`);
    expect(screen.getByText(t("audit.title").toUpperCase())).toBeTruthy();
    expect(screen.getByText(t("audit.period.clean"))).toBeTruthy();
    expect(screen.getByText(t("audit.sealShort.OK"))).toBeTruthy();
    // En la vista previa hay exportar y enviar, pero no otra «Vista previa».
    expect(screen.getByTestId("payroll-export")).toBeTruthy();
    expect(screen.queryByTestId("payroll-preview")).toBeNull();
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith(`/session/${s.id}/audit`);
  });
});

describe("Auditoría de la jornada", () => {
  test("muestra edición con antes/después y marca «no registrado» lo que no existe", async () => {
    const s = await closedDay();
    await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: s.declaredStartAtMs + 5 * 60_000, endAtMs: time.now(), note: "Ajuste de entrada" });
    await hydrate();
    mockParams.id = String(s.id);
    wrap(<SessionAuditScreen />);
    expect(await screen.findByTestId("audit-view")).toBeTruthy();
    expect(screen.getAllByText(t("audit.author")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("audit-missing-AUTHOR")).toBeTruthy();
    expect(screen.getByTestId("audit-missing-NOTIFICATION_CHANNEL")).toBeTruthy();
    expect(screen.queryByTestId("audit-missing-GPS_LOSS_DURATION")).toBeNull();
    expect(screen.getByTestId("audit-seal").props.children).toMatch(/^Sello correcto/);
    expect(screen.getByTestId("audit-seal-after")).toBeTruthy();
    const edit = (await PersistenceService.listLedger({ sessionId: s.id, intent: "MANUAL_PATCH" }))[0];
    expect(screen.getByTestId(`audit-edit-${edit.id}`)).toBeTruthy();
  });

  test("entrada desde el detalle de sesión", async () => {
    const s = await closedDay();
    await hydrate();
    mockParams.id = String(s.id);
    wrap(<SessionDetailScreen />);
    fireEvent.press(await screen.findByTestId("session-audit-link"));
    expect(mockPush).toHaveBeenCalledWith(`/session/${s.id}/audit`);
  });

  test("el expediente abre la vista previa del periodo («Ver estado de nómina»)", async () => {
    await closedDay();
    const sealed = await generateWeeklyPayroll(getWeekStart(time.now(), selectCalendarHistory(Store.getState())), getWeekEnd(getWeekStart(time.now(), selectCalendarHistory(Store.getState())), selectCalendarHistory(Store.getState())));
    expect(sealed.ok).toBe(true);
    const pack = (await PersistenceService.listPacks())[0];
    await hydrate();
    mockParams.packId = pack.id;
    mockPush.mockClear();
    wrap(<PackScreen />);
    fireEvent.press(await screen.findByTestId("pack-view-statement"));
    expect(mockPush).toHaveBeenCalledWith(`/report/${weekPeriodId(pack.manifest.periodStart, selectCalendarHistory(Store.getState()))}`);
    expect(screen.getByText(t("reports.viewStatement"))).toBeTruthy();
  });
});
