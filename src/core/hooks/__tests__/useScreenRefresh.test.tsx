/** Pull-to-refresh: tokens, safe area, movimiento reducido y gesto que relee SQLite. */
import React from "react";
import { ScrollView, Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Store, StoreActions } from "../../store";
import { TOKENS } from "../../../constants/theme";
import { ReduceMotionPref } from "../../../components/ui/motion";
import { makeSession } from "../../../../test/fixtures/session.fixture";
import { t } from "../../../i18n";
import { PersistenceService } from "../../../services/persistence/PersistenceService";
import { seedSite } from "../../../../test/helpers";
import { SettingsService } from "../../../services/persistence/SettingsService";
import { useAutoRefresh, usePullToRefresh } from "../useScreenRefresh";

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactNs.useEffect(() => {
        const clean = cb();
        return typeof clean === "function" ? clean : undefined;
      }, [cb]);
    },
  };
});

function Harness({ edge = false }: { edge?: boolean }) {
  const { refreshControl } = usePullToRefresh(edge ? { safeArea: "edge" } : undefined);
  useAutoRefresh();
  return (
    <ScrollView testID="scroll" refreshControl={refreshControl}>
      <Text>cuerpo</Text>
    </ScrollView>
  );
}

function controlProps() {
  return screen.getByTestId("scroll").props.refreshControl.props as {
    refreshing: boolean;
    onRefresh: () => void;
    tintColor: string;
    colors: string[];
    progressBackgroundColor: string;
    progressViewOffset: number;
    title?: string;
    accessibilityLabel: string;
    testID: string;
  };
}

async function hydrateEmpty(): Promise<void> {
  const settings = await SettingsService.load();
  StoreActions.hydrated({
    sessions: [],
    sites: [],
    packs: [],
    settings,
    osKillDetected: false,
    hasPin: false,
    nowMs: 1,
  });
}

describe("usePullToRefresh", () => {
  test("pinta el control con los tokens y el inset consumido en 0", () => {
    render(<Harness />);
    const props = controlProps();
    expect(props.testID).toBe("screen-refresh-control");
    expect(props.tintColor).toBe(TOKENS.colors.primary);
    expect(props.colors).toEqual([TOKENS.colors.primary]);
    expect(props.progressBackgroundColor).toBe(TOKENS.colors.surface);
    expect(props.progressViewOffset).toBe(0);
    expect(props.accessibilityLabel).toBe(t("a11y.refresh"));
    expect(props.title).toBe(t("a11y.refreshing"));
    expect(props.refreshing).toBe(false);
  });

  test("edge-to-edge empuja el spinner el inset superior", () => {
    const safe = require("react-native-safe-area-context") as { __setInsets: (n: { top: number }) => void };
    safe.__setInsets({ top: 47 });
    render(<Harness edge />);
    expect(controlProps().progressViewOffset).toBe(47);
  });

  test("con movimiento reducido no muestra el título animado", () => {
    ReduceMotionPref.__set(true);
    render(<Harness />);
    expect(controlProps().title).toBeUndefined();
    expect(controlProps().accessibilityLabel).toBe(t("a11y.refresh"));
  });

  test("el gesto relee una sesión que el store no tenía", async () => {
    render(<Harness />);
    await hydrateEmpty();
    const siteId = await seedSite();
    const id = await PersistenceService.insertSession(makeSession({ siteId }));
    expect(Store.getState().sessions.byId[String(id)]).toBeUndefined();
    await act(async () => {
      controlProps().onRefresh();
    });
    await waitFor(() => {
      expect(Store.getState().sessions.byId[String(id)]?.domainStatus).toBe("ACTIVA");
    });
    await waitFor(() => expect(controlProps().refreshing).toBe(false));
  });

  test("soltar el dedo y salir de la pantalla no actualiza el estado desmontado", async () => {
    const mirror = require("../../../services/application/refreshMirror") as typeof import("../../../services/application/refreshMirror");
    let resolve: (value: { applied: boolean; skipped: boolean }) => void = () => undefined;
    const spy = jest.spyOn(mirror, "refreshMirror").mockImplementation((opts?: { force?: boolean }) => {
      if (opts?.force) {
        return new Promise((r) => {
          resolve = r;
        });
      }
      return Promise.resolve({ applied: false, skipped: true });
    });
    try {
      const view = render(<Harness />);
      await act(async () => {
        controlProps().onRefresh();
      });
      expect(spy).toHaveBeenCalledWith({ force: true });
      expect(controlProps().refreshing).toBe(true);
      view.unmount();
      await act(async () => {
        resolve({ applied: true, skipped: false });
        await Promise.resolve();
      });
    } finally {
      spy.mockRestore();
    }
  });
});
