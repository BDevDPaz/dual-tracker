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
import { BackupAdviceCard, KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { EvidencePack } from "../../src/core/contracts";
import { useAutoRefresh, useClock, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
import { selectBackupAdvice, selectCalendarHistory, selectComputedSessions, selectPacks, selectSessionsInRange, selectSettings } from "../../src/core/selectors";
import { useToast } from "../../src/context/ToastContext";
import { t } from "../../src/i18n";
import { formatCurrency, formatDate, formatRange, getWeekEnd, getWeekStart, shiftWeek, weekPeriodId } from "../../src/utils/dateUtils";

type Period = "CURRENT" | "PREVIOUS";

export default function ReportsScreen() {
  const router = useRouter();
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [period, setPeriod] = useState<Period>("CURRENT");
  const [sealing, setSealing] = useState(false);
  // TODO(propuesta): selector de "rango" libre (§5.12). Hoy solo semana actual / anterior.
  const calendar = selectCalendarHistory(state);
  const periodStart = period === "CURRENT" ? getWeekStart(nowMs, calendar) : shiftWeek(getWeekStart(nowMs, calendar), -1, calendar);
  const periodEnd = getWeekEnd(periodStart, calendar);
  const settings = selectSettings(state);

  const sessionsVersion = state.sessions;
  const statement = useQuery(() => queries.previewPeriod(periodStart, periodEnd), [periodStart, periodEnd, sessionsVersion], ["sessions", "settings"]);
  const items = useMemo(
    () => selectComputedSessions(state, nowMs, selectSessionsInRange(state, periodStart, periodEnd)),
    [state, nowMs, periodStart, periodEnd],
  );
  const packs = selectPacks(state).filter((p) => p.manifest.periodStart === periodStart);
  const latestPack = packs.reduce<EvidencePack | null>((a, p) => (!a || p.manifest.sealedAtMs > a.manifest.sealedAtMs ? p : a), null);
  const { showToast } = useToast();
  const st = statement.data;
  const hasConflict = !!st?.integrityRollup.hasConflict;
  // §16: recomendación de exportar expedientes (packs sin compartir o periodo cerrado sin pack).
  const backup = selectBackupAdvice(state, nowMs);
  const [exporting, setExporting] = useState(false);
  const exportNext = async () => {
    if (!backup.next) return;
    setExporting(true);
    await emit({ type: "EXPORT_PACK", periodStart: backup.next.periodStart, periodEnd: backup.next.periodEnd });
    setExporting(false);
  };

  const seal = async (allowUncertified: boolean) => {
    setSealing(true);
    const res = await emit({ type: "SEAL_PACK", periodStart, periodEnd, allowUncertified });
    setSealing(false);
    const pack = res.ok ? (res.data as EvidencePack | undefined) : undefined;
    if (pack) router.push(`/report/pack/${pack.id}`);
  };

  // Solo las jornadas CERRADAS entran al statement/expediente (PayrollEngine).
  const closedCount = st?.sessionIds.length ?? 0;
  const openCount = items.filter((c) => c.session.domainStatus !== "CERRADA" && !c.session.bookkeeping.cancelled).length;
  const periodId = weekPeriodId(periodStart, calendar);
  const status = statement.loading && !st ? "loading" : items.length === 0 ? "empty" : "ready";
  const canSeal = !!periodId && closedCount > 0 && !sealing;

  return (
    <ScreenContainer noPadding>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
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

        {status === "ready" && st && closedCount === 0 ? (
          <ScreenStatusBanner status="degraded" message={openCount > 0 ? t("reports.openOnly") : t("reports.noClosed")} />
        ) : null}
        {status === "ready" && st && closedCount > 0 && openCount > 0 ? (
          <ScreenStatusBanner status="degraded" message={t("reports.openExcluded")} />
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
            {periodId ? (
              <Pressable onPress={() => router.push(`/report/${periodId}`)} accessibilityRole="link">
                <Text style={[styles.link, { color: TOKENS.colors.primary }]}>{t("reports.viewStatement")}</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {items.length > 0 ? (
          <Section title={t("history.title")}>
            {items.map((c) => (
              <SessionListItem key={c.session.id} item={c} onPress={() => router.push(`/session/${c.session.id}`)} />
            ))}
          </Section>
        ) : null}

        {st && closedCount > 0 ? (
          <DocumentPreviewWidget
            employeeName={settings.profile.employeeName}
            dateRange={formatRange(periodStart, periodEnd)}
            totalHours={`${(st.regularHours + st.overtimeHours + st.transitHours).toFixed(2)} ${t("common.hours")}`}
            totalEarnings={formatCurrency(st.grossEstimate)}
            companyName={settings.company.employerName}
            certified={!hasConflict}
            lines={[
              { label: t("reports.regular"), value: `${st.regularHours.toFixed(2)} ${t("common.hours")}` },
              { label: t("reports.overtime"), value: `${st.overtimeHours.toFixed(2)} ${t("common.hours")}` },
              { label: t("reports.transit"), value: `${st.transitHours.toFixed(2)} ${t("common.hours")}` },
            ]}
            packHash={latestPack?.manifest.packHash ?? null}
            onHashCopied={(tail) => showToast(t("report.hashCopied", { hash: tail }), "success")}
          />
        ) : null}

        {hasConflict ? (
          <View style={styles.gate}>
            <ScreenStatusBanner status="conflict" message={t("reports.conflictGate")} />
            <Button label={t("reports.goToConflict")} variant="secondary" onPress={() => router.push("/system/conflict")} />
            <Button label={t("reports.exportUncertified")} variant="ghost" disabled={!canSeal} onPress={() => void seal(true)} />
          </View>
        ) : (
          <Button label={t("reports.generate")} iconName="shield-checkmark-outline" disabled={!canSeal} onPress={() => void seal(false)} />
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

        {backup.next ? <BackupAdviceCard busy={exporting} onExport={() => void exportNext()} /> : null}
      </ScrollView>
      <LoadingOverlay visible={sealing} message={t("reports.generating")} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: TOKENS.spacing["3xl"] },
  periods: { flexDirection: "row", gap: TOKENS.spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: TOKENS.spacing.md },
  card: { padding: TOKENS.spacing.lg },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.sm },
  link: { ...FONT.bodyStrong, marginTop: TOKENS.spacing.sm },
  gate: { gap: TOKENS.spacing.sm },
  actions: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.sm },
});
