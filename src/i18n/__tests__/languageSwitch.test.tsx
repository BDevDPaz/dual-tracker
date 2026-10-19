/**
 * El cambio de idioma repinta el árbol montado: pestañas, cabeceras, una
 * pantalla en la pila de atrás, un modal abierto, una guía y el aviso.
 */
import React from "react";
import { Text, View } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { setLanguage, t, useLanguage } from "..";
import { formatCurrency, formatDate, formatLocaleNumber } from "../../utils/dateUtils";
import { LanguageSwitch } from "../../components/support/LanguageSwitch";
import { ScreenTips } from "../../components/support/ScreenTips";
import { Walkthrough } from "../../components/support/Walkthrough";
import { ExitDetectionModal } from "../../components/modals/ExitDetectionModal";
import { FLOWS } from "../../support/catalog";
import TabsLayout from "../../../app/(tabs)/_layout";
import SessionLayout from "../../../app/session/_layout";
import SitesLayout from "../../../app/sites/_layout";
import ReportLayout from "../../../app/report/_layout";
import SystemLayout from "../../../app/system/_layout";
import LegalLayout from "../../../app/legal/_layout";
import SupportLayout from "../../../app/support/_layout";

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  const { Text: RNText, View: RNView } = require("react-native") as typeof import("react-native");
  function titles(children: any, screenOptions: any, kind: string) {
    return ReactNs.Children.map(children, (child: any) => {
      if (!ReactNs.isValidElement(child)) return null;
      const props = child.props as { name?: string; options?: { title?: string } };
      const name = props.name ?? "screen";
      const routeOpts =
        typeof screenOptions === "function" ? screenOptions({ route: { name } }) : (screenOptions ?? {});
      const title = props.options?.title ?? routeOpts.title;
      return (
        <RNView key={`${kind}-${name}`}>
          {title ? <RNText testID={`${kind}-${name}`}>{title}</RNText> : null}
        </RNView>
      );
    });
  }
  function Stack(props: any) {
    return <RNView>{titles(props.children, props.screenOptions, "header")}</RNView>;
  }
  Stack.Screen = function Screen() {
    return null;
  };
  function Tabs(props: any) {
    return <RNView>{titles(props.children, props.screenOptions, "tab")}</RNView>;
  }
  Tabs.Screen = function Screen() {
    return null;
  };
  return {
    Stack,
    Tabs,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useNavigation: () => ({ setOptions: jest.fn(), addListener: () => () => undefined }),
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      ReactNs.useEffect(() => {
        const clean = cb();
        return typeof clean === "function" ? clean : undefined;
      }, [cb]);
    },
    Redirect: () => null,
  };
});

/** Sáb 26 sep 2026 23:42 PDT. */
const T = Date.UTC(2026, 8, 27, 6, 42, 0);

const KEYS = [
  "tabs.today",
  "tabs.history",
  "tabs.reports",
  "tabs.settings",
  "session.title",
  "trace.title",
  "sites.title",
  "sites.newSite",
  "report.header",
  "report.packTitle",
  "health.title",
  "conflict.title",
  "settings.disclosure",
  "settings.retentionPolicy",
  "support.title",
  "support.guideTitle",
  "support.practice.title",
  "modals.exitTitle",
  "support.flows.transfer.title",
  "support.tips.forgotClock",
  "onboarding.language",
];

function BackStackPane() {
  useLanguage();
  return (
    <View>
      <Text testID="back-session">{t("session.title")}</Text>
      <Text testID="back-history">{t("history.title")}</Text>
      <Text testID="back-date">{formatDate(T)}</Text>
      <Text testID="back-hours">{formatLocaleNumber(8.25)}</Text>
      <Text testID="back-money">{formatCurrency(12.5)}</Text>
    </View>
  );
}

function expectSurface() {
  for (const key of KEYS) {
    expect(screen.getAllByText(t(key)).length).toBeGreaterThan(0);
  }
  expect(screen.getByTestId("back-date").props.children).toBe(formatDate(T));
  expect(screen.getByTestId("back-hours").props.children).toBe(formatLocaleNumber(8.25));
  expect(screen.getByTestId("back-money").props.children).toBe("$12.50");
  expect(screen.getByTestId("back-session").props.children).toBe(t("session.title"));
  expect(screen.getByTestId("back-history").props.children).toBe(t("history.title"));
}

afterEach(() => setLanguage("es"));

describe("cambio de idioma", () => {
  test("pestañas, cabeceras, pila, modal y guía pasan a EN y vuelven a ES", async () => {
    render(
      <View>
        <TabsLayout />
        <SessionLayout />
        <SitesLayout />
        <ReportLayout />
        <SystemLayout />
        <LegalLayout />
        <SupportLayout />
        <BackStackPane />
        <LanguageSwitch />
        <ScreenTips
          screen="history"
          sessionState={null}
          siteCount={0}
          batteryRestricted={false}
          provisionalSeal={false}
          hasSplitRow={false}
          hasZeroOmitted={false}
        />
        <Walkthrough title={FLOWS.transfer.title} steps={FLOWS.transfer.steps} />
        <ExitDetectionModal
          visible
          firstExitTime="11:42 PM"
          onStay={() => undefined}
          onLunch={() => undefined}
          onTransfer={() => undefined}
          onCloseDay={() => undefined}
          onDismiss={() => undefined}
        />
      </View>,
    );

    expectSurface();
    expect(screen.getByTestId("back-date").props.children).toBe("sáb, 26 sep 2026");
    expect(screen.getByTestId("back-hours").props.children).toBe("8,25");
    expect(screen.getByTestId("language-es").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("language-en").props.accessibilityState.selected).toBe(false);

    fireEvent.press(screen.getByTestId("language-en"));
    await waitFor(() => expect(screen.getByTestId("tab-index").props.children).toBe("Today"));
    expect(screen.queryByText("Hoy")).toBeNull();
    expectSurface();
    expect(screen.getByTestId("back-date").props.children).toBe("Sat, Sep 26, 2026");
    expect(screen.getByTestId("back-hours").props.children).toBe("8.25");
    expect(screen.getByTestId("back-money").props.children).toBe("$12.50");
    expect(screen.getByTestId("language-en").props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByTestId("language-es"));
    await waitFor(() => expect(screen.getByTestId("tab-index").props.children).toBe("Hoy"));
    expect(screen.queryByText("Today")).toBeNull();
    expectSurface();
    expect(screen.getByTestId("back-hours").props.children).toBe("8,25");
    expect(screen.getByTestId("language-es").props.accessibilityState.selected).toBe(true);
  });

  test("setLanguage con el mismo idioma no deja la UI a medias", () => {
    render(
      <View>
        <BackStackPane />
      </View>,
    );
    setLanguage("es");
    expect(screen.getByTestId("back-session").props.children).toBe("Sesión");
  });
});
