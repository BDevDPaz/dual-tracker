/**
 * Hero y resumen del día comparten un reloj. El resto de Hoy no se
 * vuelve a pintar cada segundo.
 */
import React from "react";
import { Text, StyleSheet, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useClock, useWorkTracker } from "../../core/hooks";
import {
  formatHundredths,
  minutesToHundredths,
  selectActiveElapsedMs,
  selectActiveSession,
  selectTodaySummary,
  type SessionStateUI,
} from "../../core/selectors";
import { t, useLanguage } from "../../i18n";
import { formatCurrency, formatDuration, formatTime } from "../../utils/dateUtils";
import { DailySummaryBlock } from "./DailySummaryBlock";
import { OperationalHeroCard } from "./OperationalHeroCard";

const BEFORE_ARRIVAL = new Set(["NO_INICIADA", "ESPERANDO"]);

interface LiveShiftPanelProps {
  ui: SessionStateUI;
  destination: string | null;
  onDestinationPress?: () => void;
  uncertified: boolean;
  nextAction?: string | null;
  busy?: boolean;
  pinPrimary?: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  counter?: string | null;
  /** Resumen visible junto al hero, con las mismas cifras. */
  showSummary?: boolean;
}

export function LiveShiftPanel({
  ui,
  destination,
  onDestinationPress,
  uncertified,
  nextAction,
  busy,
  pinPrimary,
  onPrimaryAction,
  onSecondaryAction,
  counter,
  showSummary = true,
}: LiveShiftPanelProps) {
  const nowMs = useClock(1000);
  const { state } = useWorkTracker();
  const { colors } = useTheme();
  useLanguage();
  const summary = selectTodaySummary(state, nowMs);
  const arrived = !BEFORE_ARRIVAL.has(ui.state);
  const earnings = arrived ? formatCurrency(summary.grossEstimate) : "";
  const hours = `${formatHundredths(minutesToHundredths(summary.netMinutes))} ${t("common.hours")}`;
  const active = selectActiveSession(state);
  const cancelled = (active?.transitSegments ?? []).filter((seg) => seg.cancelled);

  return (
    <View style={styles.stack} testID="live-shift">
      <OperationalHeroCard
        ui={ui}
        destination={destination}
        onDestinationPress={onDestinationPress}
        timeString={formatDuration(selectActiveElapsedMs(state, nowMs))}
        earnings={earnings}
        showEarnings={arrived && ui.showTimer}
        uncertified={uncertified}
        nextAction={nextAction}
        busy={busy}
        pinPrimary={pinPrimary}
        counter={counter}
        onPrimaryAction={onPrimaryAction}
        onSecondaryAction={onSecondaryAction}
      />
      {showSummary ? (
        <DailySummaryBlock hours={hours} earnings={arrived ? formatCurrency(summary.grossEstimate) : "—"} />
      ) : null}
      {cancelled.map((seg) => (
        <Text key={seg.id} style={[styles.transit, { color: colors.text.secondary }]} testID="transit-cancelled">
          {t("today.transitCancelled")}
          {seg.endAtMs != null ? ` · ${formatTime(seg.endAtMs)}` : ""}
          {seg.cancelNote?.trim() ? ` · ${seg.cancelNote.trim()}` : ""}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: TOKENS.spacing.md },
  transit: { ...FONT.bodySmall },
});
