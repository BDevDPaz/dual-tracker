/**
 * Reportes · salidas de RR-1, RR-2 y RR-3 en pantalla (wireframes de Reportes, §11):
 *  - RT-1: tras sellar y editar, «Exportar expediente» comparte un pack nuevo.
 *  - RT-2: un pack sin PDF ofrece «Volver a emitir» en Reportes y en el expediente.
 *  - RT-3: semana no certificable sin CONFLICT → «Exportar no certificado».
 *  - D4 (Solicitud 8): compartir un pack que no es el último pide confirmación,
 *    en la lista de Reportes y en el expediente; el último se comparte directo.
 */
import React from "react";
import * as Sharing from "expo-sharing";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { selectCalendarHistory } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { routeIntent } from "../../../src/services/application/intentRouter";
import { EvidencePackService } from "../../../src/services/evidence/EvidencePackService";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { getWeekEnd, getWeekStart } from "../../../src/utils/dateUtils";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { HOUR, MIN } from "../../../test/fixtures/session.fixture";
import { time } from "../../../test/time";
import ReportsScreen from "../../(tabs)/reports";
import PackScreen from "../pack/[packId]";

const mockPush = jest.fn();
const mockReplace = jest.fn();
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
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
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
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  return mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
}

function week() {
  const history = selectCalendarHistory(Store.getState());
  const start = getWeekStart(time.now(), history);
  return { start, end: getWeekEnd(start, history) };
}

async function sealWeek() {
  const { start, end } = week();
  const r = await routeIntent({ type: "SEAL_PACK", periodStart: start, periodEnd: end });
  if (!r.ok) throw new Error(`sello fallido: ${r.code}`);
  return (await PersistenceService.listPacks())[0];
}

/** Lo que deja una restauración en otro teléfono: los PDF no viajan. */
async function dropPdfs(packId: string) {
  const db = await PersistenceService.init();
  await db.runAsync("UPDATE evidence_packs SET employee_pdf_uri = NULL, employer_pdf_uri = NULL WHERE id = ?", [packId]);
  time.travel(MIN);
}

function wrap(node: React.ReactElement) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  sharing.__shared.length = 0;
});

describe("RT-1 · Reportes no comparte el pack desactualizado", () => {
  test("sellar, editar una jornada y pulsar «Exportar expediente»: se sella de nuevo y se comparte el pack nuevo", async () => {
    const s = await closedDay();
    const old = await sealWeek();
    time.travel(MIN);
    await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: s.declaredStartAtMs + 5 * MIN, endAtMs: s.endAtMs, note: "Ajuste" });
    await hydrate();
    wrap(<ReportsScreen />);
    expect(await screen.findByText(t("reports.packStale"))).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("payroll-export"));
    });
    await waitFor(() => expect(sharing.__shared.length).toBe(1));
    const packs = await PersistenceService.listPacks();
    expect(packs.length).toBe(2);
    const fresh = packs.find((p) => p.id !== old.id)!;
    expect(sharing.__shared[0]).toBe(fresh.employeePdfUri);
    expect(sharing.__shared[0]).not.toBe(old.employeePdfUri);
  });
});

describe("RT-2 · pack sin PDF: «Volver a emitir»", () => {
  test("el expediente sin PDF desactiva compartir, ofrece reemitir y abre el pack nuevo", async () => {
    await closedDay();
    const pack = await sealWeek();
    await dropPdfs(pack.id);
    await hydrate();
    mockParams.packId = pack.id;
    wrap(<PackScreen />);

    expect(await screen.findByText(t("report.pdfMissing"))).toBeTruthy();
    expect(screen.getByTestId("pack-share-employee").props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId("pack-reissue"));
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const next = (await PersistenceService.listPacks()).find((p) => p.id !== pack.id)!;
    expect(next.employeePdfUri).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/report/pack/[packId]", params: { packId: next.id, sealed: "1" } });
    const entry = (await PersistenceService.listLedger()).filter((e) => e.intent === "PAYROLL_SEALED").at(-1)!;
    expect(entry.reason).toBe("PACK_REISSUED");
  });

  test("la lista de expedientes de Reportes ofrece «Volver a emitir» en lugar de compartir", async () => {
    await closedDay();
    const pack = await sealWeek();
    await dropPdfs(pack.id);
    await hydrate();
    wrap(<ReportsScreen />);

    expect(await screen.findByTestId(`pack-pdf-missing-${pack.id}`)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId(`pack-reissue-${pack.id}`));
    });
    await waitFor(async () => expect((await PersistenceService.listPacks()).length).toBe(2));
    const next = (await PersistenceService.listPacks()).find((p) => p.id !== pack.id)!;
    expect(next.employerPdfUri).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/report/pack/[packId]", params: { packId: next.id, sealed: "1" } });
  });
});

describe("RT-3 · semana no certificable sin CONFLICT", () => {
  test("Reportes ofrece «Exportar no certificado» y sella el expediente no certificado", async () => {
    const s = await closedDay();
    const stored = (await PersistenceService.getSession(s.id))!;
    // Bloqueo de certificación (p. ej. FIELD_CRYPTO_UNAVAILABLE) sin CONFLICT.
    await PersistenceService.updateSession({ ...stored, bookkeeping: { ...stored.bookkeeping, certificationBlockers: ["FIELD_CRYPTO_UNAVAILABLE"] } });
    const { start, end } = week();
    // Sin la salida nueva, el sello certificado se queda aquí.
    expect(await EvidencePackService.seal({ periodStart: start, periodEnd: end })).toMatchObject({ ok: false, code: "PERIOD_NOT_CERTIFIABLE" });
    await hydrate();
    wrap(<ReportsScreen />);

    expect(await screen.findByTestId(`week-not-certifiable-${start}`)).toBeTruthy();
    expect(screen.getByText(t("reports.notCertifiableGate"))).toBeTruthy();
    expect(screen.queryByText(t("reports.goToConflict"))).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId(`week-export-uncertified-${start}`));
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const [pack] = await PersistenceService.listPacks();
    expect(pack.manifest.certified).toBe(false);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/report/pack/[packId]", params: { packId: pack.id, sealed: "1" } });
  });

  test("una semana certificable no muestra la salida de no certificado", async () => {
    await closedDay();
    await hydrate();
    wrap(<ReportsScreen />);
    expect(await screen.findByTestId("payroll-report")).toBeTruthy();
    expect(screen.queryByTestId(`week-not-certifiable-${week().start}`)).toBeNull();
  });
});

/** Dos packs de la misma semana: `older` sellado un minuto antes que `latest` (reemisión). */
async function twoPacks() {
  await closedDay();
  const older = await sealWeek();
  time.travel(MIN);
  const { start, end } = week();
  const r = await routeIntent({ type: "SEAL_PACK", periodStart: start, periodEnd: end, reissue: true });
  if (!r.ok) throw new Error(`reemisión fallida: ${r.code}`);
  const latest = (await PersistenceService.listPacks()).find((p) => p.id !== older.id)!;
  return { older, latest };
}

async function sharedPackIds(): Promise<string[]> {
  return (await PersistenceService.listLedger({ intent: "PACK_SHARED" })).map((e) => (JSON.parse(e.payloadJson) as { data: { packId: string } }).data.packId);
}

describe("D4 · aviso «no es el último» en Reportes", () => {
  test("un pack anterior muestra el aviso con fecha y hash de ambos y no comparte hasta confirmar; «Compartir este» envía el elegido", async () => {
    const { older, latest } = await twoPacks();
    await hydrate();
    wrap(<ReportsScreen />);

    fireEvent.press(await screen.findByTestId(`pack-share-employer-${older.id}`));
    expect(await screen.findByTestId("share-not-latest")).toBeTruthy();
    const chosenText = screen.getByTestId("share-not-latest-chosen").props.children as string;
    const newestText = screen.getByTestId("share-not-latest-newest").props.children as string;
    expect(chosenText).toContain(older.manifest.packHash.slice(0, 8));
    expect(newestText).toContain(latest.manifest.packHash.slice(0, 8));
    expect(chosenText).not.toContain(older.manifest.packHash.slice(0, 9));
    expect(await sharedPackIds()).toEqual([]);

    await act(async () => {
      fireEvent.press(screen.getByTestId("share-not-latest-this"));
    });
    await waitFor(async () => expect(await sharedPackIds()).toEqual([older.id]));
    await waitFor(() => expect(screen.queryByTestId("share-not-latest")).toBeNull());
  });

  test("«Compartir el último» envía el pack más nuevo (empleado)", async () => {
    const { older, latest } = await twoPacks();
    await hydrate();
    wrap(<ReportsScreen />);

    fireEvent.press(await screen.findByTestId(`pack-share-employee-${older.id}`));
    expect(await screen.findByTestId("share-not-latest")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(t("reports.shareLatest")));
    });
    await waitFor(() => expect(sharing.__shared).toEqual([latest.employeePdfUri]));
    expect(await sharedPackIds()).toEqual([latest.id]);
  });

  test("«Cancelar» cierra el aviso sin compartir", async () => {
    const { older } = await twoPacks();
    await hydrate();
    wrap(<ReportsScreen />);

    fireEvent.press(await screen.findByTestId(`pack-share-employee-${older.id}`));
    expect(await screen.findByTestId("share-not-latest")).toBeTruthy();
    fireEvent.press(screen.getByText(t("common.cancel")));
    await waitFor(() => expect(screen.queryByTestId("share-not-latest")).toBeNull());
    expect(sharing.__shared).toEqual([]);
    expect(await sharedPackIds()).toEqual([]);
  });

  test("el último pack se comparte directo, sin aviso", async () => {
    const { latest } = await twoPacks();
    await hydrate();
    wrap(<ReportsScreen />);

    const button = await screen.findByTestId(`pack-share-employee-${latest.id}`);
    await act(async () => {
      fireEvent.press(button);
    });
    await waitFor(() => expect(sharing.__shared).toEqual([latest.employeePdfUri]));
    expect(screen.queryByTestId("share-not-latest")).toBeNull();
  });
});

describe("D4 · aviso «no es el último» en el expediente", () => {
  test("el expediente de un pack anterior pide confirmación y «Compartir este» lo envía", async () => {
    const { older } = await twoPacks();
    await hydrate();
    mockParams.packId = older.id;
    wrap(<PackScreen />);

    fireEvent.press(await screen.findByTestId("pack-share-employee"));
    expect(await screen.findByTestId("share-not-latest")).toBeTruthy();
    expect(sharing.__shared).toEqual([]);
    await act(async () => {
      fireEvent.press(screen.getByTestId("share-not-latest-this"));
    });
    await waitFor(() => expect(sharing.__shared).toEqual([older.employeePdfUri]));
  });

  test("el expediente del último pack comparte con el empleador sin aviso", async () => {
    const { latest } = await twoPacks();
    await hydrate();
    mockParams.packId = latest.id;
    wrap(<PackScreen />);

    const button = await screen.findByTestId("pack-share-employer");
    await act(async () => {
      fireEvent.press(button);
    });
    await waitFor(async () => expect(await sharedPackIds()).toEqual([latest.id]));
    expect(screen.queryByTestId("share-not-latest")).toBeNull();
  });
});
