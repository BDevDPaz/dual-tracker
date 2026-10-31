/**
 * (onboarding)/ready.tsx — Listo. Filas según PermissionsHealthService.
 * «Empezar» siempre sigue: marca el alta y abre Hoy. Un aviso abre el ajuste
 * que le corresponde. La tarifa solo se informa.
 */
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { FONT, ICON, TOKENS } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { selectHealth, selectSettings } from "../../src/core/selectors";
import { getLanguage, t } from "../../src/i18n";
import {
  formatReminderClock,
  lockedRateAmount,
  readDeviceHour24,
  readyHeadline,
  readyRows,
  type ReadyRow,
} from "../../src/onboarding/flow";

const ROW_LABEL: Record<ReadyRow["id"], "onboarding.readyFine" | "onboarding.readyBg" | "onboarding.readyBattery" | "onboarding.readyNotif" | "onboarding.readyReminder" | "onboarding.readyRate"> = {
  fine: "onboarding.readyFine",
  background: "onboarding.readyBg",
  battery: "onboarding.readyBattery",
  notifications: "onboarding.readyNotif",
  reminder: "onboarding.readyReminder",
  rate: "onboarding.readyRate",
};

export default function ReadyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; reminder?: string }>();
  const { colors } = useTheme();
  const { state, emit } = useWorkTracker();
  const { busy, run } = useBusyAction();
  const health = selectHealth(state);
  const profile = selectSettings(state).profile;
  const name = typeof params.name === "string" && params.name.trim().length >= 2 ? params.name.trim() : profile.employeeName.trim();
  const reminder = typeof params.reminder === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(params.reminder) ? params.reminder : profile.dailyReminderTime;
  const hour24 = readDeviceHour24();
  const clock = formatReminderClock(reminder, hour24);
  const rows = readyRows({
    platform: Platform.OS,
    foreground: health.locationForeground,
    accuracy: health.locationAccuracy,
    background: health.locationBackground,
    battery: health.batteryOptimization,
    notifications: health.notifications,
  });
  const headline = t(readyHeadline(rows));

  const onStart = () =>
    run(async () => {
      const res = await emit({
        type: "COMPLETE_ONBOARDING",
        profile: {
          employeeName: name,
          hourlyRate: profile.hourlyRate,
          language: getLanguage(),
          dailyReminderTime: reminder,
        },
      });
      if (res.ok) router.replace("/");
      return res;
    });

  const rowText = (row: ReadyRow) => {
    if (row.id === "reminder") return t("onboarding.readyReminder", { time: clock });
    if (row.id === "rate") return `${t("onboarding.readyRate")} · ${t("onboarding.rateLockedValue", { amount: lockedRateAmount(profile.hourlyRate) })}`;
    return t(ROW_LABEL[row.id]);
  };

  return (
    <ScreenScroll edges={SAFE_EDGES.none} footer={<Button label={t("onboarding.readyStart")} isLoading={busy} onPress={onStart} />}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.titleFlex, { color: colors.text.primary }]}>{headline}</Text>
        <HelpButton screen="profile" />
      </View>
      {rows.map((row) => {
        const label = rowText(row);
        const warning = row.kind === "status" && !row.ok;
        const body = (
          <View style={styles.row}>
            {row.kind === "info" ? (
              <Ionicons name="lock-closed-outline" size={ICON.md} color={colors.text.secondary} />
            ) : (
              <Ionicons
                name={row.ok ? "checkmark-circle" : "warning-outline"}
                size={ICON.md}
                color={row.ok ? colors.status.success : colors.status.warning}
              />
            )}
            <Text style={[styles.rowLabel, { color: colors.text.primary }]}>{label}</Text>
          </View>
        );
        const target = row.settings;
        if (!warning || !target) return <View key={row.id}>{body}</View>;
        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => void emit({ type: "OPEN_OS_SETTINGS", target })}
          >
            {body}
          </Pressable>
        );
      })}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  titleFlex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, minHeight: TOKENS.layout.minTouchTarget },
  rowLabel: { ...FONT.body, flex: 1 },
});
