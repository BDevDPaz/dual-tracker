import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import type { ComputedSession } from "../../core/selectors";
import { t } from "../../i18n";
import { formatCurrency, formatDate, formatTime } from "../../utils/dateUtils";
import { IntegrityBadge } from "../ui/IntegrityBadge";

/**
 * Ítem de lista de sesiones (Historial / Reportes): fecha, alias de sitio,
 * rango horario, horas, estimado, IntegrityBadge. Nunca muestra "NaN h":
 * si no hay preview, muestra "—".
 */
export function SessionListItem({ item, onPress }: { item: ComputedSession; onPress?: () => void }) {
  const s = item.session;
  const start = s.actualStartAtMs ?? s.declaredStartAtMs;
  const conflict = s.integrityClass === "CONFLICT";
  const hours = item.preview ? `${(item.preview.netMinutes / 60).toFixed(2)} ${t("common.hours")}` : "—";
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.row, { borderColor: TOKENS.colors.border }]}>
      <View style={styles.main}>
        <Text style={[styles.date, { color: TOKENS.colors.text.secondary }]}>{formatDate(start)}</Text>
        <Text style={[styles.site, { color: conflict ? TOKENS.colors.status.warning : TOKENS.colors.text.primary }]} numberOfLines={1}>
          {item.site?.alias ?? t("today.noDestination")}
        </Text>
        <Text style={[styles.range, { color: TOKENS.colors.text.secondary }]}>
          {formatTime(start)} – {s.endAtMs ? formatTime(s.endAtMs) : "…"}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.hours, { color: TOKENS.colors.text.primary }]}>{hours}</Text>
        <Text style={[styles.amount, { color: TOKENS.colors.primary }]}>{item.preview ? formatCurrency(item.preview.grossEstimate) : "—"}</Text>
        <IntegrityBadge integrity={s.integrityClass} />
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
