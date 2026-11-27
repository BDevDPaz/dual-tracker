/**
 * Aviso «términos no congelados» (report.termsNotFrozen): un expediente v1–v5
 * no guarda multiplicador ni banderas, así que se lee con los vigentes y las
 * pantallas lo dicen. Un v6 no muestra el aviso.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import type { EvidencePack, PackManifest } from "../../../src/core/contracts";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { selectCalendarHistory } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { routeIntent } from "../../../src/services/application/intentRouter";
import { packHashBody } from "../../../src/services/evidence/EvidencePackService";
import { sha256Hex } from "../../../src/services/evidence/HashChain";
import { signCanonicalBody } from "../../../src/services/evidence/packSignature";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { canonicalJson } from "../../../src/utils/canonicalJson";
import { getWeekEnd, getWeekStart, weekPeriodId } from "../../../src/utils/dateUtils";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { time } from "../../../test/time";
import ReportsScreen from "../../(tabs)/reports";
import PeriodStatementScreen from "../[periodId]";
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

function week() {
  const history = selectCalendarHistory(Store.getState());
  const start = getWeekStart(time.now(), history);
  return { start, end: getWeekEnd(start, history) };
}

async function sealedWeek(): Promise<EvidencePack> {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  await hydrate();
  const { start, end } = week();
  const r = await routeIntent({ type: "SEAL_PACK", periodStart: start, periodEnd: end });
  if (!r.ok) throw new Error(`sello fallido: ${r.code}`);
  return (await PersistenceService.listPacks())[0];
}

/** El mismo pack como v5 (sin payrollTerms), con su hash y su firma rehechos. */
async function storeAsV5(pack: EvidencePack): Promise<void> {
  const { payrollTerms: _t, packHash: _h, signature: _s, files, ...rest } = pack.manifest;
  const unsigned = { ...rest, manifestVersion: 5 };
  const body = packHashBody(unsigned);
  const packHash = await sha256Hex(canonicalJson(body));
  const signature = await signCanonicalBody(body, packHash);
  const manifest: PackManifest = { ...unsigned, packHash, files, ...(signature ? { signature } : {}) };
  const db = await PersistenceService.init();
  await db.runAsync("UPDATE evidence_packs SET manifest_json = ?, statement_json = ?, pack_hash = ? WHERE id = ?", [
    JSON.stringify(manifest),
    JSON.stringify({ ...pack.statement, packHash }),
    packHash,
    pack.id,
  ]);
}

function wrap(node: React.ReactElement) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

beforeEach(() => {
  for (const k of Object.keys(mockParams)) delete mockParams[k];
});

describe("aviso «términos no congelados»", () => {
  test("un expediente v6 no muestra el aviso", async () => {
    const pack = await sealedWeek();
    expect(pack.manifest.payrollTerms).toBeTruthy();
    await hydrate();
    mockParams.packId = pack.id;
    wrap(<PackScreen />);
    expect(await screen.findByText(pack.manifest.packHash)).toBeTruthy();
    expect(screen.queryByText(t("report.termsNotFrozen"))).toBeNull();
  });

  test("un expediente v5 muestra el aviso en el expediente", async () => {
    const pack = await sealedWeek();
    await storeAsV5(pack);
    await hydrate();
    mockParams.packId = pack.id;
    wrap(<PackScreen />);
    expect(await screen.findByText(t("report.termsNotFrozen"))).toBeTruthy();
  });

  test("con un pack v5, la lista de Reportes y la vista previa del periodo muestran el aviso", async () => {
    const pack = await sealedWeek();
    await storeAsV5(pack);
    await hydrate();
    const first = wrap(<ReportsScreen />);
    expect(await screen.findByTestId(`pack-terms-unfrozen-${pack.id}`)).toBeTruthy();
    first.unmount();
    mockParams.periodId = weekPeriodId(week().start, selectCalendarHistory(Store.getState()));
    wrap(<PeriodStatementScreen />);
    expect(await screen.findByText(t("report.termsNotFrozen"))).toBeTruthy();
  });
});
