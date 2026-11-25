/**
 * report/[periodId].tsx — Vista previa del periodo (Producto §5.13, PR3).
 * Vista de lectura del PayrollStatement (preview de PayrollEngine): líneas,
 * policyId y advertencias, más la «Auditoría de jornadas» del periodo
 * (selectSessionAudit por jornada) y las acciones del Reporte de nómina
 * («Exportar expediente» = EXPORT_PACK, «Enviar por correo» = SHARE_EMPLOYER).
 * No sella por sí sola: EXPORT_PACK sella solo si la semana no tiene expediente.
 * Entradas: Reportes («Vista previa») y el expediente («Ver estado de nómina»).
 * periodId = "W<YYYY-MM-DD>" (lunes ISO).
 */
import { Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, NotFoundState, SAFE_EDGES, ScreenContainer, ScreenScroll, Section } from "../../src/components/ui";
import { ScreenTips } from "../../src/components/support/ScreenTips";
import { KeyValueRow, PayrollReportActions, PeriodAuditSection, ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useAutoRefresh, useBusyAction, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
import {
  displayStatement,
  formatPayRateLine,
  selectCalendarHistory,
  selectLedgerHealth,
  selectPacks,
  selectPeriodAuditRows,
  selectPeriodSessionRows,
  selectSessionAudit,
} from "../../src/core/selectors";
import { t, tLineKind, tWarning } from "../../src/i18n";
import { formatCurrency, formatRange, formatUiDecimal, parseWeekPeriodId } from "../../src/utils/dateUtils";

export default function PeriodStatementScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { periodId } = useLocalSearchParams<{ periodId: string }>();
  const { state, emit, queries, now } = useWorkTracker();
  const { busy: exporting, run: runExport } = useBusyAction();
  const { busy: sending, run: runSend } = useBusyAction();
  const { refreshControl } = usePullToRefresh({ safeArea: "edge" });
  useAutoRefresh();
  const range = parseWeekPeriodId(String(periodId ?? ""), selectCalendarHistory(state));
  const nowMs = now();
  const portionRows = range ? selectPeriodSessionRows(state, range.start, range.end, nowMs) : [];
  const statement = useQuery(
    () => (range ? queries.previewPeriod(range.start, range.end) : Promise.resolve(null)),
    [range?.start, range?.end, state.sessions],
    ["sessions", "settings"],
  );
  const seen = new Map<number, (typeof portionRows)[number]["session"]>();
  for (const r of portionRows) if (!seen.has(r.session.id)) seen.set(r.session.id, r.session);
  const periodSessions = [...seen.values()];
  const auditKey = periodSessions.map((s) => `${s.id}:${s.bookkeeping.updatedAtMs}`).join(",");
  const auditInputs = useQuery(() => queries.periodAudit(periodSessions), [auditKey], ["ledger", "trace", "packs"]);
  const incident = selectLedgerHealth(state).broken;
  // Pocas jornadas por semana: el selector puro se recalcula en cada render.
  const auditMap = auditInputs.data;
  const auditRows = auditMap
    ? selectPeriodAuditRows(periodSessions.filter((s) => auditMap.has(s.id)).map((s) => selectSessionAudit(s, auditMap.get(s.id)!, { chainIncident: incident })))
    : [];

  if (!range) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <NotFoundState title={t("report.invalidPeriod")} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/reports"))} />
      </ScreenContainer>
    );
  }
  const st = statement.data;
  if (statement.loading && !st) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }
  if (!st) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="empty" message={statement.error ? t("common.loadError") : t("common.noData")} />
      </ScreenContainer>
    );
  }

  const packs = selectPacks(state).filter((p) => p.manifest.periodStart === range.start);
  const latestPack = packs.reduce<(typeof packs)[number] | null>((a, p) => (!a || p.manifest.sealedAtMs > a.manifest.sealedAtMs ? p : a), null);
  const shown = displayStatement(st);
  const noCompanyEmail = !state.settings.company.companyEmail?.trim();

  return (
    <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
      <ScreenTips
        screen="statement"
        sessionState={null}
        siteCount={0}
        batteryRestricted={false}
        provisionalSeal={packs.some((p) => p.manifest.sealedAtMs <= range.end)}
        hasSplitRow={portionRows.some((r) => r.continuesFromMs != null || r.continuesUntilMs != null)}
        hasZeroOmitted={portionRows.some((r) => r.zeroDuration)}
      />
      <Text style={[styles.title, { color: colors.text.primary }]}>{t("report.statement")}</Text>
      <Text style={[styles.caption, { color: colors.text.secondary }]}>{formatRange(range.start, range.end)}</Text>
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
        <KeyValueRow label={t("reports.regular")} value={`${formatUiDecimal(shown.regular)} ${t("common.hours")}`} />
        <KeyValueRow label={t("reports.overtime")} value={`${formatUiDecimal(shown.overtime)} ${t("common.hours")}`} />
        <KeyValueRow label={t("reports.transit")} value={`${formatUiDecimal(shown.transit)} ${t("common.hours")}`} />
        <KeyValueRow label={t("reports.lunch")} value={`${st.lunchMinutes} ${t("common.minutes")}`} />
        <KeyValueRow label={t("reports.total")} value={shown.gross} emphasis />
        <Text style={[styles.caption, { color: colors.text.muted }]}>
          {t("session.policy")}: {st.policyId} · {t(st.integrityRollup.certified ? "report.certified" : "report.uncertified")}
        </Text>
      </Card>

      <Section title={t("report.lines")}>
        {st.lines.length === 0 ? <Text style={{ color: colors.text.muted }}>{t("common.noData")}</Text> : null}
        {st.lines.map((l, i) => (
          <KeyValueRow key={`${l.sessionId}-${l.kind}-${l.dateString}-${i}`} label={`${l.dateString} · ${tLineKind(l.kind)} · ${formatPayRateLine(l.minutes, l.rate)}`} value={formatCurrency(l.amount)} />
        ))}
      </Section>

      {st.warnings.length > 0 ? (
        <Section title={t("report.warnings")}>
          {st.warnings.map((w) => (
            <Text key={w} style={{ color: colors.statusText.warning }}>
              • {tWarning(w)}
            </Text>
          ))}
        </Section>
      ) : null}

      <PayrollReportActions
        onExport={() => void runExport(() => emit({ type: "EXPORT_PACK", periodStart: range.start, periodEnd: range.end }))}
        onSend={() => {
          if (latestPack) void runSend(() => emit({ type: "SHARE_EMPLOYER", packId: latestPack.id }));
        }}
        exportDisabled={st.sessionIds.length === 0 || (st.integrityRollup.hasConflict && !latestPack)}
        needsSeal={!latestPack}
        noCompanyEmail={noCompanyEmail}
        onGoSettings={() => router.push("/(tabs)/settings")}
        exporting={exporting}
        sending={sending}
      />

      <PeriodAuditSection
        rows={auditRows}
        loading={auditInputs.loading}
        error={!!auditInputs.error}
        onOpen={(sessionId) => router.push(`/session/${sessionId}/audit`)}
      />

      {packs.map((p) => (
        <Button key={p.id} label={`${t("report.packTitle")} · ${p.manifest.packHash.slice(0, 8)}`} variant="secondary" onPress={() => router.push(`/report/pack/${p.id}`)} />
      ))}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { ...FONT.h2 },
  caption: { ...FONT.caption },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
});
