import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import type { ComputedSession, PeriodSessionRow } from "../../core/selectors";
import { t } from "../../i18n";
import { formatCurrency, formatDate, formatTime } from "../../utils/dateUtils";
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
  const s = item.session;
  const start = slice?.displayStartMs ?? s.actualStartAtMs ?? s.declaredStartAtMs;
  const end = slice ? slice.displayEndMs : s.endAtMs;
  const conflict = s.integrityClass === "CONFLICT";
  const net = slice ? slice.netMinutes : item.preview ? item.preview.netMinutes : null;
  const gross = slice ? slice.grossEstimate : item.preview ? item.preview.grossEstimate : null;
  const hours = hoursText ?? (net == null ? "—" : `${formatHundredths(minutesToHundredths(net))} ${t("common.hours")}`);
  const zero = slice?.zeroDuration ?? (s.domainStatus === "CERRADA" && s.endAtMs != null && net === 0);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.row, { borderColor: TOKENS.colors.border }]}>
      <View style={styles.main}>
        <Text style={[styles.date, { color: TOKENS.colors.text.secondary }]}>{formatDate(start)}</Text>
        <Text style={[styles.site, { color: conflict ? TOKENS.colors.status.warning : TOKENS.colors.text.primary }]} numberOfLines={1}>
          {item.siteLabel || item.site?.alias || t("today.noDestination")}
        </Text>
        <Text style={[styles.range, { color: TOKENS.colors.text.secondary }]}>
          {formatTime(start)} – {end != null ? formatTime(end) : "…"}
        </Text>
        {slice?.continuesFromMs != null ? (
          <Text style={[styles.range, { color: TOKENS.colors.text.muted }]}>{t("history.continuesFrom", { date: formatDate(slice.continuesFromMs) })}</Text>
        ) : null}
        {slice?.continuesUntilMs != null ? (
          <Text style={[styles.range, { color: TOKENS.colors.text.muted }]}>{t("history.continuesUntil", { date: formatDate(slice.continuesUntilMs) })}</Text>
        ) : null}
        {zero ? <Text style={[styles.range, { color: TOKENS.colors.status.warning }]}>{t("history.zeroDuration")}</Text> : null}
      </View>
      <View style={styles.side}>
        <Text style={[styles.hours, { color: TOKENS.colors.text.primary }]}>{hours}</Text>
        <Text style={[styles.amount, { color: TOKENS.colors.primary }]}>
          {slice?.grossCents != null ? formatCents(slice.grossCents) : gross == null ? "—" : formatCurrency(gross)}
        </Text>
        <IntegrityBadge integrity={s.integrityClass} blocked={(s.bookkeeping.certificationBlockers ?? []).length > 0} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingVertical: TOKENS.spacing.md, borderBottomWidth: 1, gap: TOKENS.spacing.md },
  main: { flex: 1 },
  side: { alignItems: "flex-end", gap: 4 },
  date: { ...FONT.caption },
  site: { ...FONT.bodyStrong, marginTop: 2 },
  range: { ...FONT.caption, marginTop: 2 },
  hours: { ...FONT.bodyStrong, fontSize: 14 },
  amount: { ...FONT.caption },
});
