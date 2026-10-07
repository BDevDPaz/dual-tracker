/**
 * report/[periodId].tsx — Estado de nómina del periodo (Producto §5.13).
 * Vista de lectura del PayrollStatement (preview de PayrollEngine): líneas,
 * policyId y advertencias. Sustituye al widget mock DocumentPreviewWidget
 * como pantalla completa. periodId = "W<YYYY-MM-DD>" (lunes ISO).
 */
import { Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, EmptyState, ScreenContainer, Section } from "../../src/components/ui";
import { KeyValueRow, ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useAutoRefresh, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
import { selectCalendarHistory, selectPacks } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatCurrency, formatRange, parseWeekPeriodId } from "../../src/utils/dateUtils";

export default function PeriodStatementScreen() {
  const router = useRouter();
  const { periodId } = useLocalSearchParams<{ periodId: string }>();
  const { state, queries } = useWorkTracker();
  const { refreshControl } = usePullToRefresh({ safeArea: "edge" });
  useAutoRefresh();
  const range = parseWeekPeriodId(String(periodId ?? ""), selectCalendarHistory(state));
  const statement = useQuery(
    () => (range ? queries.previewPeriod(range.start, range.end) : Promise.resolve(null)),
    [range?.start, range?.end, state.sessions],
    ["sessions", "settings"],
  );

  if (!range) {
    return (
      <ScreenContainer>
        <EmptyState title={t("report.invalidPeriod")} icon="document-outline" />
        <Button label={t("common.back")} onPress={() => router.back()} />
      </ScreenContainer>
    );
  }
  const st = statement.data;
  if (statement.loading && !st) return <ScreenStatusBanner status="loading" message={t("common.loading")} />;
  if (!st) return <ScreenStatusBanner status="empty" message={statement.error ?? t("common.noData")} />;

  const packs = selectPacks(state).filter((p) => p.manifest.periodStart === range.start);

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("report.statement")}</Text>
      <Text style={[styles.caption, { color: TOKENS.colors.text.secondary }]}>{formatRange(range.start, range.end)}</Text>
      {st.sessionIds.length === 0 ? (
        <ScreenStatusBanner
          status="degraded"
          message={st.warnings.includes("OPEN_SESSION_EXCLUDED") ? t("reports.openOnly") : t("reports.noClosed")}
        />
      ) : st.warnings.includes("OPEN_SESSION_EXCLUDED") ? (
        <ScreenStatusBanner status="degraded" message={t("reports.openExcluded")} />
      ) : null}
      {st.integrityRollup.hasConflict ? (
        <ScreenStatusBanner status="conflict" message={t("reports.conflictGate")} onPress={() => router.push("/system/conflict")} />
      ) : null}

      <Card style={styles.card}>
        <KeyValueRow label={t("reports.regular")} value={`${st.regularHours.toFixed(2)} ${t("common.hours")}`} />
        <KeyValueRow label={t("reports.overtime")} value={`${st.overtimeHours.toFixed(2)} ${t("common.hours")}`} />
        <KeyValueRow label={t("reports.transit")} value={`${st.transitHours.toFixed(2)} ${t("common.hours")}`} />
        <KeyValueRow label={t("reports.lunch")} value={`${st.lunchMinutes} ${t("common.minutes")}`} />
        <KeyValueRow label={t("reports.total")} value={formatCurrency(st.grossEstimate)} emphasis />
        <Text style={[styles.caption, { color: TOKENS.colors.text.muted }]}>
          {t("session.policy")}: {st.policyId} · {t(st.integrityRollup.certified ? "report.certified" : "report.uncertified")}
        </Text>
      </Card>

      <Section title={t("report.lines")}>
        {st.lines.length === 0 ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.noData")}</Text> : null}
        {st.lines.map((l, i) => (
          <KeyValueRow key={`${l.sessionId}-${l.kind}-${i}`} label={`${l.dateString} · ${l.kind} · ${l.minutes} ${t("common.minutes")}`} value={formatCurrency(l.amount)} />
        ))}
      </Section>

      {st.warnings.length > 0 ? (
        <Section title={t("report.warnings")}>
          {st.warnings.map((w) => (
            <Text key={w} style={{ color: TOKENS.colors.status.warning }}>
              • {w}
            </Text>
          ))}
        </Section>
      ) : null}

      {packs.map((p) => (
        <Button key={p.id} label={`${t("report.packTitle")} · ${p.manifest.packHash.slice(0, 8)}`} variant="secondary" onPress={() => router.push(`/report/pack/${p.id}`)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: TOKENS.spacing["3xl"] },
  title: { ...FONT.h2 },
  caption: { ...FONT.caption },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
});
