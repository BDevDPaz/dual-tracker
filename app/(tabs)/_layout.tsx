/**
 * (tabs)/_layout.tsx — Tab bar canónica (Producto §3.1): Hoy, Historial,
 * Reportes, Ajustes. Oculta la tab bar mientras hay una decisión crítica
 * pendiente (estado SALIDA: salida detectada), para que el operario no
 * navegue fuera sin decidir. sceneStyle obsidian.
 */
import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TOKENS, ICON } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useWorkTracker, useClock } from "../../src/core/hooks";
import { selectSessionState, selectUiRequests } from "../../src/core/selectors";
import { t, useLanguage } from "../../src/i18n";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, [IconName, IconName]> = {
  index: ["today", "today-outline"],
  history: ["time", "time-outline"],
  reports: ["document-text", "document-text-outline"],
  settings: ["settings", "settings-outline"],
};

export default function TabsLayout() {
  const { state } = useWorkTracker();
  const { colors } = useTheme();
  useLanguage();
  const insets = useSafeAreaInsets();
  const nowMs = useClock(30_000);
  const sessionState = selectSessionState(state, nowMs);
  const shiftActive = sessionState !== "NO_INICIADA" && sessionState !== "CERRADA";
  const exitPending = sessionState === "SALIDA" || selectUiRequests(state).openExitModal;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        // Las tabs siguen montadas. Sin congelarlas, un cambio de idioma
        // repinta también las que no están enfocadas.
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.goldText,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: exitPending
          ? { display: "none" }
          : {
              backgroundColor: colors.background,
              borderTopColor: colors.divider,
              borderTopWidth: TOKENS.layout.hairline,
              minHeight: TOKENS.layout.minTouchTarget + insets.bottom,
            },
        tabBarAccessibilityLabel: route.name === "index" && shiftActive ? t("a11y.tabTodayActive") : undefined,
        tabBarIcon: ({ focused, color }) => {
          const [on, off] = TAB_ICONS[route.name] ?? ["ellipse", "ellipse-outline"];
          return (
            <View>
              <Ionicons name={focused ? on : off} size={ICON.xl} color={color} />
              {route.name === "index" && shiftActive ? (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: TOKENS.layout.dot,
                    height: TOKENS.layout.dot,
                    borderRadius: TOKENS.radius.pill,
                    backgroundColor: colors.goldText,
                  }}
                  accessibilityElementsHidden
                />
              ) : null}
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: t("tabs.today") }} />
      <Tabs.Screen name="history" options={{ title: t("tabs.history") }} />
      <Tabs.Screen name="reports" options={{ title: t("tabs.reports") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
