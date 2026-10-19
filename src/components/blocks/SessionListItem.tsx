import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { ComputedSession, PeriodSessionRow } from "../../core/selectors";
import { t, useLanguage } from "../../i18n";
import { formatCurrency, formatDate, formatTime, formatUiDecimal } from "../../utils/dateUtils";
import { formatCents, formatHundredths, minutesToHundredths } from "../../services/domain/payrollDisplay";
import { IntegrityBadge } from "../ui/IntegrityBadge";

/**
 * Ítem de lista de sesiones (Historial / Reportes): fecha, alias de sitio,
 * rango horario, horas, estimado, IntegrityBadge. Nunca muestra "NaN h":
 * si no hay preview, muestra "—".
 * `slice` es la porción del periodo (jornada que cruza la semana): el reloj
 * y las horas son de ese tramo, no de la jornada entera.
 */
export function SessionListItem({
  item,
  onPress,
  slice,
  hoursText,
}: {
  item: ComputedSession;
  onPress?: () => void;
  slice?: PeriodSessionRow;
  /** Horas ya repartidas para que la suma de la lista cuadre con el total. */
  hoursText?: string;
}) {
  const language = useLanguage();
  const { colors } = useTheme();
  const s = item.session;
  const start = slice?.displayStartMs ?? s.actualStartAtMs ?? s.declaredStartAtMs;
  const end = slice ? slice.displayEndMs : s.endAtMs;
  const conflict = s.integrityClass === "CONFLICT";
  const net = slice ? slice.netMinutes : item.preview ? item.preview.netMinutes : null;
  const gross = slice ? slice.grossEstimate : item.preview ? item.preview.grossEstimate : null;
  const hoursRaw = hoursText ?? (net == null ? "—" : `${formatHundredths(minutesToHundredths(net))} ${t("common.hours")}`);
  const hours = hoursRaw === "—" ? hoursRaw : formatUiDecimal(hoursRaw, language);
  const zero = slice?.zeroDuration ?? (s.domainStatus === "CERRADA" && s.endAtMs != null && net === 0);
  const reasonKey = `reviewReasons.${s.bookkeeping.integrityReason}`;
  const reasonLabel = t(reasonKey);
  const reason = reasonLabel === reasonKey ? "" : reasonLabel;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.main}>
        <Text style={[styles.date, { color: colors.text.secondary }]}>{formatDate(start)}</Text>
        <Text style={[styles.site, { color: conflict ? colors.status.warning : colors.text.primary }]} numberOfLines={1}>
          {item.siteLabel || item.site?.alias || t("today.noDestination")}
        </Text>
        <Text style={[styles.range, { color: colors.text.secondary }]}>
          {formatTime(start)} – {end != null ? formatTime(end) : "…"}
        </Text>
        {slice?.continuesFromMs != null ? (
          <Text style={[styles.range, { color: colors.text.muted }]}>{t("history.continuesFrom", { date: formatDate(slice.continuesFromMs) })}</Text>
        ) : null}
        {slice?.continuesUntilMs != null ? (
          <Text style={[styles.range, { color: colors.text.muted }]}>{t("history.continuesUntil", { date: formatDate(slice.continuesUntilMs) })}</Text>
        ) : null}
        {zero ? <Text style={[styles.range, { color: colors.status.warning }]}>{t("history.zeroDuration")}</Text> : null}
        {reason ? <Text style={[styles.range, { color: colors.status.warning }]}>{reason}</Text> : null}
      </View>
      <View style={styles.side}>
        <Text style={[styles.hours, { color: colors.text.primary }]}>{hours}</Text>
        <Text style={[styles.amount, { color: colors.primary }]}>
          {slice?.grossCents != null ? formatCents(slice.grossCents) : gross == null ? "—" : formatCurrency(gross)}
        </Text>
        <IntegrityBadge integrity={s.integrityClass} blocked={(s.bookkeeping.certificationBlockers ?? []).length > 0} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingVertical: TOKENS.spacing.md, borderBottomWidth: TOKENS.layout.hairline, gap: TOKENS.spacing.md },
  main: { flex: 1 },
  side: { alignItems: "flex-end", gap: TOKENS.spacing.xs },
  date: { ...FONT.caption },
  site: { ...FONT.bodyStrong, marginTop: TOKENS.spacing.xxs },
  range: { ...FONT.caption, ...FONT.tabularNums, marginTop: TOKENS.spacing.xxs },
  hours: { ...FONT.figure },
  amount: { ...FONT.figure },
});
