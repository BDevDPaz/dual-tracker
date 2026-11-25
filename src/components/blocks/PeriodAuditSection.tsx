/**
 * PeriodAuditSection — «Auditoría de jornadas» en la vista previa del periodo
 * (PR3). Una fila por jornada con lo que registró: clase, ediciones,
 * conflictos, cierre automático, sello y huecos. Cada fila abre la auditoría
 * de la jornada. Solo presenta.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../ui/Card";
import { IntegrityBadge } from "../ui/IntegrityBadge";
import { Section } from "../ui/Section";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { PeriodAuditRow } from "../../core/selectors";
import { t, useLanguage } from "../../i18n";

function summary(r: PeriodAuditRow): string {
  const parts: string[] = [];
  if (r.edits) parts.push(t("audit.period.edits", { n: r.edits }));
  if (r.conflictsOpen) parts.push(t("audit.period.conflictsOpen", { n: r.conflictsOpen }));
  if (r.conflictsResolved) parts.push(t("audit.period.conflictsResolved", { n: r.conflictsResolved }));
  if (r.autoClosed) parts.push(t("audit.period.autoClosed"));
  if (r.trailGaps + r.monitoringGaps) parts.push(t("audit.period.gaps", { n: r.trailGaps + r.monitoringGaps }));
  return parts.length ? parts.join(" · ") : t("audit.period.clean");
}

interface Props {
  rows: PeriodAuditRow[];
  loading?: boolean;
  error?: boolean;
  onOpen: (sessionId: number) => void;
}

export function PeriodAuditSection({ rows, loading, error, onOpen }: Props) {
  useLanguage();
  const { colors } = useTheme();
  return (
    <Section title={t("audit.title")}>
      <View testID="period-audit" style={styles.list}>
        {loading && rows.length === 0 ? <Text style={[styles.caption, { color: colors.text.muted }]}>{t("common.loading")}</Text> : null}
        {error ? <Text style={[styles.caption, { color: colors.statusText.warning }]}>{t("common.loadError")}</Text> : null}
        {!loading && !error && rows.length === 0 ? <Text style={[styles.caption, { color: colors.text.muted }]}>{t("audit.period.empty")}</Text> : null}
        {rows.map((r) => (
          <Pressable
            key={r.sessionId}
            testID={`period-audit-${r.sessionId}`}
            accessibilityRole="button"
            accessibilityLabel={`${t("audit.open")} · ${r.dateString}`}
            onPress={() => onOpen(r.sessionId)}
          >
            <Card style={styles.card}>
              <View style={styles.head}>
                <Text style={[styles.date, { color: colors.text.primary }]}>{r.dateString}</Text>
                <IntegrityBadge integrity={r.integrityClass} />
              </View>
              <Text style={[styles.caption, { color: colors.text.secondary }]}>{summary(r)}</Text>
              <Text style={[styles.caption, { color: r.seal === "MISMATCH" ? colors.statusText.warning : colors.text.muted }]}>
                {t(`audit.sealShort.${r.seal}`)}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  list: { gap: TOKENS.spacing.sm },
  card: { padding: TOKENS.spacing.md, gap: TOKENS.spacing.xs },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm },
  date: { ...FONT.bodyStrong },
  caption: { ...FONT.caption },
});
