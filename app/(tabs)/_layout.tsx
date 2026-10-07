/**
 * (tabs)/_layout.tsx — Tab bar canónica (Producto §3.1): Hoy, Historial,
 * Reportes, Ajustes. Oculta la tab bar mientras hay una decisión crítica
 * pendiente (estado SALIDA: salida detectada), para que el operario no
 * navegue fuera sin decidir. sceneStyle obsidian.
 */
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS } from "../../src/constants/theme";
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
  useLanguage();
  const nowMs = useClock(30_000);
  const exitPending = selectSessionState(state, nowMs) === "SALIDA" || selectUiRequests(state).openExitModal;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        // Las tabs siguen montadas. Sin congelarlas, un cambio de idioma
        // repinta también las que no están enfocadas.
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: TOKENS.colors.background },
        tabBarActiveTintColor: TOKENS.colors.primary,
        tabBarInactiveTintColor: TOKENS.colors.text.muted,
        tabBarStyle: exitPending
          ? { display: "none" }
          : { backgroundColor: TOKENS.colors.surface, borderTopColor: TOKENS.colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const [on, off] = TAB_ICONS[route.name] ?? ["ellipse", "ellipse-outline"];
          return <Ionicons name={focused ? on : off} size={size} color={color} />;
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
