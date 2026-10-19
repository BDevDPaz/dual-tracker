/**
 * (tabs)/reports.tsx — Centro de reportes (Producto §5.12).
 * Rango libre (semana, quincena, mes o fechas) partido en semanas laborales.
 * Cada semana usa el mismo motor que el expediente. No se sella un rango
 * que mezcle semanas: el sello sigue siendo de una semana.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Chip, DocumentPreviewWidget, ExportStatusCard, Input, LoadingOverlay, PageHeader, PrimaryButton, SAFE_EDGES, ScreenScroll, Section, VmacSheet } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { BackupAdviceCard, KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { ScreenTips } from "../../src/components/support/ScreenTips";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import type { EvidencePack, PayrollStatement } from "../../src/core/contracts";
import { useAutoRefresh, useClock, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
import {
  allocateDisplayHundredths,
  displayStatement,
  formatHundredths,
  selectBackupAdvice,
  selectCalendarHistory,
  selectComputedSessions,
  selectPacks,
  selectPeriodSessionRows,
  selectSettings,
} from "../../src/core/selectors";
import { useToast } from "../../src/context/ToastContext";
import { t } from "../../src/i18n";
import { formatDate, formatRange, formatUiDecimal, toDateString } from "../../src/utils/dateUtils";
import {
  combineWeekStatements,
  corporateDayBounds,
  isSingleWorkWeek,
  presetRange,
  validateReportRange,
  type ClosedRange,
  type RangePreset,
} from "../../src/utils/reportRange";

const PRESETS: RangePreset[] = ["CURRENT_WEEK", "PREVIOUS_WEEK", "QUINCENA", "MONTH", "CUSTOM"];

const PRESET_KEY: Record<RangePreset, string> = {
  CURRENT_WEEK: "reports.periodCurrent",
  PREVIOUS_WEEK: "reports.periodPrevious",
  QUINCENA: "reports.periodQuincena",
  MONTH: "reports.periodMonth",
  CUSTOM: "reports.periodCustom",
};

export default function ReportsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [vmac, setVmac] = useState(false);
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [preset, setPreset] = useState<RangePreset>("CURRENT_WEEK");
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [sealing, setSealing] = useState(false);
  const calendar = selectCalendarHistory(state);
  const settings = selectSettings(state);

  const customError = preset === "CUSTOM" ? customRangeError(startText, endText) : null;
  const requested: ClosedRange | null =
    preset === "CUSTOM"
      ? customError
        ? null
        : customBounds(startText, endText)
      : presetRange(preset, nowMs, calendar);

  const preview = useQuery(
    () => (requested ? queries.previewRange(requested.start, requested.end) : Promise.resolve({ ok: false as const, code: "RANGE_INVALID" as const })),
    [requested?.start ?? 0, requested?.end ?? 0, preset === "CUSTOM" && !requested ? 1 : 0],
    ["sessions", "settings"],
  );
  const weeks = useMemo(() => (preview.data && preview.data.ok ? preview.data.data.weeks : []), [preview.data]);
  const single = !!requested && isSingleWorkWeek(requested, calendar) && weeks.length === 1;
  const anchor = single ? weeks[0] : null;
  const freshness = useQuery(
    () => (anchor ? queries.sealFreshness(anchor.start, anchor.end) : Promise.resolve(null)),
    [anchor?.start ?? 0, anchor?.end ?? 0],
    ["sessions", "packs", "ledger"],
  );

  const sessionsVersion = state.sessions;
  void sessionsVersion;
  const combined = useMemo(() => combineWeekStatements(weeks.map((w) => w.statement)), [weeks]);
  const shown = combined ? displayStatement(combined) : null;
  const rows = useMemo(() => {
    if (!weeks.length) return [];
    return weeks.flatMap((w) => selectPeriodSessionRows(state, w.start, w.end, nowMs).map((row) => ({ ...row, weekStart: w.start })));
  }, [state, nowMs, weeks]);
  const computedById = useMemo(() => new Map(selectComputedSessions(state, nowMs).map((c) => [c.session.id, c])), [state, nowMs]);
  const hoursById = new Map((shown?.rows ?? []).map((r) => [r.sessionId, `${r.hours} ${t("common.hours")}`]));
  const hourSource = single ? rows.filter((r) => !hoursById.has(r.session.id)) : rows;
  const openHundredths = allocateDisplayHundredths(hourSource.map((r) => r.netMinutes ?? 0));
  let openCursor = 0;
  const rowHours = new Map<string, string>();
  for (const r of rows) {
    const sealed = hoursById.get(r.session.id);
    const key = `${r.weekStart}:${r.session.id}`;
    if (sealed && single) rowHours.set(key, sealed);
    else rowHours.set(key, `${formatHundredths(openHundredths[openCursor++] ?? 0)} ${t("common.hours")}`);
  }

  const weekStarts = new Set(weeks.map((w) => w.start));
  const packs = selectPacks(state).filter((p) => weekStarts.has(p.manifest.periodStart));
  const latestPack = single
    ? packs.filter((p) => p.manifest.periodStart === anchor?.start).reduce<EvidencePack | null>((a, p) => (!a || p.manifest.sealedAtMs > a.manifest.sealedAtMs ? p : a), null)
    : null;
  const { showToast } = useToast();
  const hasConflict = !!combined?.integrityRollup.hasConflict;
  const backup = selectBackupAdvice(state, nowMs);
  const [exporting, setExporting] = useState(false);
  const exportNext = async () => {
    if (!backup.next) return;
    setExporting(true);
    await emit({ type: "EXPORT_PACK", periodStart: backup.next.periodStart, periodEnd: backup.next.periodEnd });
    setExporting(false);
  };

  const seal = async (start: number, end: number, allowUncertified: boolean) => {
    setSealing(true);
    const res = await emit({ type: "SEAL_PACK", periodStart: start, periodEnd: end, allowUncertified });
    setSealing(false);
    const pack = res.ok ? (res.data as EvidencePack | undefined) : undefined;
    if (pack) router.push({ pathname: "/report/pack/[packId]", params: { packId: pack.id, sealed: "1" } });
  };

  const closedCount = combined?.sessionIds.length ?? 0;
  const openCount = rows.filter((c) => c.session.domainStatus !== "CERRADA" && !c.session.bookkeeping.cancelled).length;
  const status = !requested || customError ? "ready" : preview.loading && !preview.data ? "loading" : rows.length === 0 && weeks.every((w) => w.statement.sessionIds.length === 0) ? "empty" : "ready";
  const fresh = freshness.data;
  const canSealWeek = (st: PayrollStatement) => st.sessionIds.length > 0 && !sealing;
  const rangeChain = useFormFocusChain(FORM_FIELDS.reportsRange, { canSubmit: preset === "CUSTOM" && !customError });

  const choose = (p: RangePreset) => {
    setPreset(p);
    if (p === "CUSTOM" && !startText) {
      const week = presetRange("CURRENT_WEEK", nowMs, calendar);
      if (week) {
        setStartText(toDateString(week.start));
        setEndText(toDateString(week.end));
      }
    }
  };

  const subtitle = requested
    ? formatRange(requested.start, requested.end)
    : preset === "CUSTOM" && !startText.trim() && !endText.trim()
      ? t("reports.periodCustom")
      : t("reports.rangeInvalid");

  return (
    <View style={styles.root}>
      <ScreenScroll
        edges={SAFE_EDGES.tab}
        refreshControl={refreshControl}
        footer={
          single && anchor && !weeks[0]?.statement.integrityRollup.hasConflict && canSealWeek(anchor.statement) ? (
            <PrimaryButton
              label={t("reports.generate")}
              iconName="shield-checkmark-outline"
              isLoading={sealing}
              onPress={() => void seal(anchor.start, anchor.end, false)}
            />
          ) : undefined
        }
      >
        <PageHeader title={t("reports.title")} subtitle={subtitle} helpScreen="reports" showHealth />
        <ScreenTips
          screen="reports"
          sessionState={null}
          siteCount={0}
          batteryRestricted={false}
          provisionalSeal={!!(fresh?.latestPackId && fresh.sealedBeforePeriodEnd)}
          hasSplitRow={rows.some((r) => r.continuesFromMs != null || r.continuesUntilMs != null)}
          hasZeroOmitted={rows.some((r) => r.zeroDuration)}
        />
        <View style={styles.periods}>
          {PRESETS.map((p) => (
            <Chip key={p} label={t(PRESET_KEY[p])} selected={preset === p} onPress={() => choose(p)} />
          ))}
        </View>
        {preset === "CUSTOM" ? (
          <View style={styles.dates}>
            <Input {...rangeChain.props("start")} label={t("reports.rangeStart")} value={startText} onChangeText={setStartText} placeholder={t("reports.datePlaceholder")} />
            <Input {...rangeChain.props("end")} label={t("reports.rangeEnd")} value={endText} onChangeText={setEndText} placeholder={t("reports.datePlaceholder")} />
          </View>
        ) : null}
        {customError ? <ScreenStatusBanner status="degraded" message={t(customError === "RANGE_ORDER" ? "reports.rangeOrder" : customError === "RANGE_TOO_LONG" ? "reports.rangeTooLong" : "reports.rangeInvalid")} /> : null}
        {!single && weeks.length > 1 ? <ScreenStatusBanner status="degraded" message={t("reports.weekMath")} /> : null}

        {status !== "ready" ? (
          <ScreenStatusBanner status={status} message={status === "empty" ? t("reports.empty") : t("common.loading")} emptyDescription={status === "empty" ? t("reports.emptyBody") : undefined} emptyIcon="document-outline" />
        ) : null}

        {status === "ready" && combined && closedCount === 0 && !customError ? (
          <ScreenStatusBanner status="degraded" message={openCount > 0 ? t("reports.openOnly") : t("reports.noClosed")} />
        ) : null}
        {status === "ready" && combined && closedCount > 0 && openCount > 0 ? (
          <ScreenStatusBanner status="degraded" message={t("reports.openExcluded")} />
        ) : null}
        {single && fresh?.latestPackId && fresh.sealedBeforePeriodEnd ? <ScreenStatusBanner status="degraded" message={t("reports.packEarly")} /> : null}
        {single && fresh?.latestPackId && !fresh.matches ? <ScreenStatusBanner status="degraded" message={t("reports.packStale")} /> : null}

        {combined && shown && !customError ? (
          <Card style={styles.card}>
            <Text style={[styles.label, { color: colors.text.secondary }]}>{t(single ? "reports.rollup" : "reports.combined")}</Text>
            <KeyValueRow label={t("reports.regular")} value={`${formatUiDecimal(shown.regular)} ${t("common.hours")}`} />
            <KeyValueRow label={t("reports.overtime")} value={`${formatUiDecimal(shown.overtime)} ${t("common.hours")}`} />
            <KeyValueRow label={t("reports.transit")} value={`${formatUiDecimal(shown.transit)} ${t("common.hours")}`} />
            <KeyValueRow label={t("reports.lunch")} value={`${combined.lunchMinutes} ${t("common.minutes")}`} />
            <KeyValueRow label={t("reports.total")} value={shown.gross} emphasis />
            {single ? (
              <>
                <KeyValueRow
                  label={t("reports.integrity")}
                  value={`V ${combined.integrityRollup.byClass.VALID} · M ${combined.integrityRollup.byClass.MANUAL} · A ${combined.integrityRollup.byClass.AUTO} · C ${combined.integrityRollup.byClass.CONFLICT}`}
                />
                <Pressable onPress={() => setVmac(true)} accessibilityRole="button" accessibilityLabel={t("vmac.open")}>
                  <Text style={[styles.label, { color: colors.text.secondary }]}>{t("vmac.mark")}</Text>
                </Pressable>
              </>
            ) : null}
          </Card>
        ) : null}

        {single ? (
          <ExportStatusCard
            sealed={!!fresh?.latestPackId}
            matches={!!fresh?.latestPackId && fresh.matches !== false}
            early={!!(fresh?.latestPackId && fresh.sealedBeforePeriodEnd)}
            pendingExport={!!backup.next}
          />
        ) : null}

        {weeks.map((week) => {
          const weekRows = rows.filter((r) => r.weekStart === week.start);
          if (!single && weekRows.length === 0 && week.statement.sessionIds.length === 0) return null;
          const weekShown = displayStatement(week.statement);
          const weekConflict = week.statement.integrityRollup.hasConflict;
          return (
            <Section key={week.start} title={t("reports.weekOf", { range: formatRange(week.start, week.end) })}>
              {!single ? (
                <Card style={styles.card}>
                  <KeyValueRow label={t("reports.regular")} value={`${formatUiDecimal(weekShown.regular)} ${t("common.hours")}`} />
                  <KeyValueRow label={t("reports.overtime")} value={`${formatUiDecimal(weekShown.overtime)} ${t("common.hours")}`} />
                  <KeyValueRow label={t("reports.total")} value={weekShown.gross} emphasis />
                </Card>
              ) : null}
              {weekRows.map((slice) => {
                const item = computedById.get(slice.session.id);
                if (!item) return null;
                return (
                  <SessionListItem
                    key={`${week.start}:${slice.session.id}`}
                    item={item}
                    slice={slice}
                    hoursText={rowHours.get(`${week.start}:${slice.session.id}`)}
                    onPress={() => router.push(`/session/${slice.session.id}`)}
                  />
                );
              })}
              {weekConflict ? (
                <View style={styles.gate}>
                  <Button label={t("reports.goToConflict")} variant="secondary" onPress={() => router.push("/system/conflict")} />
                  <Button label={t("reports.exportUncertified")} variant="ghost" disabled={!canSealWeek(week.statement)} onPress={() => void seal(week.start, week.end, true)} />
                </View>
              ) : single ? null : (
                <Button
                  label={t("reports.sealWeek")}
                  iconName="shield-checkmark-outline"
                  disabled={!canSealWeek(week.statement)}
                  onPress={() => void seal(week.start, week.end, false)}
                />
              )}
            </Section>
          );
        })}

        {single && combined && shown && closedCount > 0 ? (
          <DocumentPreviewWidget
            employeeName={settings.profile.employeeName}
            dateRange={formatRange(anchor!.start, anchor!.end)}
            totalHours={`${shown.worked} ${t("common.hours")}`}
            totalEarnings={shown.gross}
            companyName={settings.company.employerName}
            certified={!hasConflict}
            lines={[
              { label: t("reports.regular"), value: `${shown.regular} ${t("common.hours")}` },
              { label: t("reports.overtime"), value: `${shown.overtime} ${t("common.hours")}` },
              { label: t("reports.transit"), value: `${shown.transit} ${t("common.hours")}` },
            ]}
            packHash={latestPack?.manifest.packHash ?? null}
            onHashCopied={(tail) =>
              showToast(t("report.hashCopied", { hash: tail }), "success", undefined, (lang) => ({
                title: t("report.hashCopied", { hash: tail }, lang),
              }))
            }
          />
        ) : null}

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
      </ScreenScroll>
      <VmacSheet visible={vmac} onClose={() => setVmac(false)} />
      <LoadingOverlay visible={sealing} message={t("reports.generating")} />
    </View>
  );
}

function customBounds(startText: string, endText: string): ClosedRange | null {
  const start = corporateDayBounds(startText.trim());
  const end = corporateDayBounds(endText.trim());
  if (!start || !end) return null;
  return { start: start.start, end: end.end };
}

function customRangeError(startText: string, endText: string): "RANGE_INVALID" | "RANGE_ORDER" | "RANGE_TOO_LONG" | null {
  if (!startText.trim() && !endText.trim()) return null;
  const range = customBounds(startText, endText);
  if (!range) return startText.trim() || endText.trim() ? "RANGE_INVALID" : null;
  const check = validateReportRange(range.start, range.end);
  return check.ok ? null : check.code;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  periods: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  dates: { gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  card: { padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.sm },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.sm },
  gate: { gap: TOKENS.spacing.sm },
  actions: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.sm },
});
