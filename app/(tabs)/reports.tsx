/**
 * (tabs)/reports.tsx — Centro de reportes (Producto §5.12). REDISEÑO.
 * Periodo, rollup del PayrollEngine (preview), sesiones del periodo,
 * DocumentPreviewWidget (solo con PayrollStatement) y acciones de
 * EvidencePack. No genera HTML ni llama a Print en la pantalla: SEAL_PACK.
 * Con CONFLICT en el periodo, el expediente exige pasar por /system/conflict
 * o exportar con sello "No certificado" visible.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, DocumentPreviewWidget, LoadingOverlay, PageHeader, ScreenContainer, Section } from "../../src/components/ui";
import { KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { EvidencePack } from "../../src/core/contracts";
import { useClock, useQuery, useWorkTracker } from "../../src/core/hooks";
import { selectComputedSessions, selectPacks, selectSessionsInRange, selectSettings } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatCurrency, formatDate, formatRange, getWeekEnd, getWeekStart, shiftWeek, weekPeriodId } from "../../src/utils/dateUtils";

type Period = "CURRENT" | "PREVIOUS";

export default function ReportsScreen() {
  const router = useRouter();
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(60_000);
  const [period, setPeriod] = useState<Period>("CURRENT");
  const [sealing, setSealing] = useState(false);
  // TODO(propuesta): selector de "rango" libre (§5.12). Hoy solo semana actual / anterior.
  const periodStart = period === "CURRENT" ? getWeekStart(nowMs) : shiftWeek(getWeekStart(nowMs), -1);
  const periodEnd = getWeekEnd(periodStart);
  const settings = selectSettings(state);

  const sessionsVersion = state.sessions;
  const statement = useQuery(() => queries.previewPeriod(periodStart, periodEnd), [periodStart, periodEnd, sessionsVersion]);
  const items = useMemo(
    () => selectComputedSessions(state, nowMs, selectSessionsInRange(state, periodStart, periodEnd)),
    [state, nowMs, periodStart, periodEnd],
  );
  const packs = selectPacks(state).filter((p) => p.manifest.periodStart === periodStart);
  const st = statement.data;
  const hasConflict = !!st?.integrityRollup.hasConflict;

  const seal = async (allowUncertified: boolean) => {
    setSealing(true);
    const res = await emit({ type: "SEAL_PACK", periodStart, periodEnd, allowUncertified });
    setSealing(false);
    const pack = res.ok ? (res.data as EvidencePack | undefined) : undefined;
    if (pack) router.push(`/report/pack/${pack.id}`);
  };

  const status = statement.loading && !st ? "loading" : items.length === 0 ? "empty" : "ready";

  return (
    <ScreenContainer noPadding>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader title={t("reports.title")} subtitle={formatRange(periodStart, periodEnd)} />
        <View style={styles.periods}>
          {(["CURRENT", "PREVIOUS"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === p }}
              style={[styles.chip, { borderColor: period === p ? TOKENS.colors.primary : TOKENS.colors.border }]}
            >
              <Text style={{ color: period === p ? TOKENS.colors.primary : TOKENS.colors.text.secondary }}>
                {t(p === "CURRENT" ? "reports.periodCurrent" : "reports.periodPrevious")}
              </Text>
            </Pressable>
          ))}
        </View>

        {status !== "ready" ? (
          <ScreenStatusBanner status={status} message={status === "empty" ? t("reports.empty") : t("common.loading")} emptyIcon="document-outline" />
        ) : null}

        {st ? (
          <Card style={styles.card}>
            <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("reports.rollup")}</Text>
            <KeyValueRow label={t("reports.regular")} value={`${st.regularHours.toFixed(2)} ${t("common.hours")}`} />
            <KeyValueRow label={t("reports.overtime")} value={`${st.overtimeHours.toFixed(2)} ${t("common.hours")}`} />
            <KeyValueRow label={t("reports.transit")} value={`${st.transitHours.toFixed(2)} ${t("common.hours")}`} />
            <KeyValueRow label={t("reports.lunch")} value={`${st.lunchMinutes} ${t("common.minutes")}`} />
            <KeyValueRow label={t("reports.total")} value={formatCurrency(st.grossEstimate)} emphasis />
            <KeyValueRow
              label={t("reports.integrity")}
              value={`V ${st.integrityRollup.byClass.VALID} · M ${st.integrityRollup.byClass.MANUAL} · A ${st.integrityRollup.byClass.AUTO} · C ${st.integrityRollup.byClass.CONFLICT}`}
            />
            <Pressable onPress={() => router.push(`/report/${weekPeriodId(periodStart)}`)} accessibilityRole="link">
              <Text style={[styles.link, { color: TOKENS.colors.primary }]}>{t("reports.viewStatement")}</Text>
            </Pressable>
          </Card>
        ) : null}

        {items.length > 0 ? (
          <Section title={t("history.title")}>
            {items.map((c) => (
              <SessionListItem key={c.session.id} item={c} onPress={() => router.push(`/session/${c.session.id}`)} />
            ))}
          </Section>
        ) : null}

        {st && items.length > 0 ? (
          <DocumentPreviewWidget
            employeeName={settings.profile.employeeName}
            dateRange={formatRange(periodStart, periodEnd)}
            totalHours={`${(st.regularHours + st.overtimeHours + st.transitHours).toFixed(2)} ${t("common.hours")}`}
            totalEarnings={formatCurrency(st.grossEstimate)}
            companyName={settings.company.employerName}
            certified={!hasConflict}
          />
        ) : null}

        {hasConflict ? (
          <View style={styles.gate}>
            <ScreenStatusBanner status="conflict" message={t("reports.conflictGate")} />
            <Button label={t("reports.goToConflict")} variant="secondary" onPress={() => router.push("/system/conflict")} />
            <Button label={t("reports.exportUncertified")} variant="ghost" disabled={sealing} onPress={() => void seal(true)} />
          </View>
        ) : (
          <Button label={t("reports.generate")} iconName="shield-checkmark-outline" disabled={items.length === 0 || sealing} onPress={() => void seal(false)} />
        )}

        {packs.length > 0 ? (
          <Section title={t("reports.packs")}>
            {packs.map((p) => (
              <Card key={p.id} style={styles.card}>
                <KeyValueRow label={t("report.sealedAt")} value={formatDate(p.manifest.sealedAtMs)} />
                <KeyValueRow label={t("report.hash")} value={`${p.manifest.packHash.slice(0, 16)}…`} mono />
                <KeyValueRow label="" value={t(p.manifest.certified ? "report.certified" : "report.uncertified")} />
                <View style={styles.actions}>
                  <Button label={t("reports.shareEmployee")} size="sm" variant="secondary" onPress={() => void emit({ type: "SHARE_EMPLOYEE", packId: p.id })} />
                  <Button label={t("reports.shareEmployer")} size="sm" variant="secondary" onPress={() => void emit({ type: "SHARE_EMPLOYER", packId: p.id })} />
                  <Button label={t("reports.viewManifest")} size="sm" variant="ghost" onPress={() => router.push(`/report/pack/${p.id}`)} />
                </View>
              </Card>
            ))}
          </Section>
        ) : null}
      </ScrollView>
      <LoadingOverlay visible={sealing} message={t("reports.generating")} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: TOKENS.spacing["3xl"] },
  periods: { flexDirection: "row", gap: TOKENS.spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: TOKENS.spacing.md },
  card: { padding: TOKENS.spacing.lg },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.sm },
  link: { ...FONT.bodyStrong, marginTop: TOKENS.spacing.sm },
  gate: { gap: TOKENS.spacing.sm },
  actions: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.sm },
});
