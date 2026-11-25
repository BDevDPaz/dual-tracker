/**
 * SessionAuditView — Auditoría de una jornada (PR3). Solo presenta.
 * Recibe el resultado del selector puro selectSessionAudit. Lo que no se
 * registra se muestra como «no registrado»; no se rellena ni se estima.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../ui/Card";
import { IntegrityBadge } from "../ui/IntegrityBadge";
import { Section } from "../ui/Section";
import { KeyValueRow } from "./KeyValueRow";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { AuditRow, AuditTimes, SessionAudit } from "../../core/contracts";
import { t, useLanguage } from "../../i18n";
import { tLedgerIntent, tReviewReason, tSpatialType } from "../../i18n/labels";
import { formatDateTime, formatTime } from "../../utils/dateUtils";

const minutes = (ms: number | undefined) => Math.max(0, Math.round((ms ?? 0) / 60_000));

function span(startMs: number | null, endMs: number | null): string {
  if (startMs === null) return "—";
  return `${formatDateTime(startMs)} – ${endMs === null ? t("audit.openState") : formatTime(endMs)}`;
}

function timesText(x: AuditTimes | undefined): string {
  if (!x) return t("audit.notRecorded");
  return span(x.actualStartAtMs ?? x.declaredStartAtMs, x.endAtMs);
}

function reliabilityText(r: AuditRow): string {
  const parts: string[] = [];
  parts.push(r.detail.reliable === true ? t("audit.reliable") : r.detail.reliable === false ? t("audit.unreliable") : t("audit.reliabilityUnknown"));
  if (typeof r.detail.accuracyM === "number") parts.push(t("audit.accuracy", { m: Math.round(r.detail.accuracyM) }));
  if (r.detail.unreliableReason) parts.push(r.detail.unreliableReason);
  if (r.detail.mocked) parts.push(t("audit.mocked"));
  return parts.join(" · ");
}

function Line({ children, muted, testID }: { children: React.ReactNode; muted?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Text testID={testID} style={[styles.line, { color: muted ? colors.text.secondary : colors.text.primary }]}>
      {children}
    </Text>
  );
}

function NoteLine({ row }: { row: AuditRow }) {
  if (row.note.status === "READABLE") return <Line>{t("audit.reason", { text: row.note.text })}</Line>;
  if (row.note.status === "DIGEST_ONLY") return <Line muted>{t("audit.reasonNotRecorded")}</Line>;
  return null;
}

function UserLines({ row }: { row: AuditRow }) {
  return (
    <>
      {row.notRecorded.includes("AUTHOR") ? <Line muted>{t("audit.author")}</Line> : null}
      {row.notRecorded.includes("NOTIFICATION_CHANNEL") ? <Line muted>{t("audit.channel")}</Line> : null}
    </>
  );
}

function causeLabel(cause: string | undefined): string {
  const key = `audit.autoCause.${cause ?? "unknown"}`;
  const label = t(key);
  return label === key ? t("audit.autoCause.unknown") : label;
}

function monitoringText(r: AuditRow): string {
  switch (r.intent) {
    case "MONITORING_GAP":
      return t("audit.monitoringGap", { min: minutes(r.detail.gapMs) });
    case "OS_KILL":
      return [t("audit.osKill", { min: minutes(r.detail.gapMs) }), r.detail.deviceOffMs !== undefined ? t("audit.deviceOff", { min: minutes(r.detail.deviceOffMs) }) : null]
        .filter(Boolean)
        .join(" ");
    case "GPS_LOST":
      return t("audit.gpsLost");
    default:
      return tLedgerIntent(r.intent);
  }
}

export function SessionAuditView({ audit }: { audit: SessionAudit }) {
  useLanguage();
  const { colors } = useTheme();
  const rows = audit.rows;
  const byId = new Map(rows.map((r) => [r.ledgerId, r]));
  const spatial = rows.filter((r) => r.kind === "SPATIAL" || r.kind === "EXIT");
  const edits = rows.filter((r) => r.kind === "EDIT");
  const breaks = rows.filter((r) => r.kind === "BREAK");
  const autoRows = rows.filter((r) => r.kind === "AUTO_CLOSE" || r.kind === "ORPHAN");
  const monitoring = rows.filter((r) => r.kind === "MONITORING" || (r.kind === "CLOCK" && r.detail.suspect));
  const c = audit.compliance;

  return (
    <View testID="audit-view" style={styles.root}>
      <Text style={[styles.caption, { color: colors.text.secondary }]}>{t("audit.readOnly")}</Text>

      <Section title={t("audit.sections.summary")}>
        <Card style={styles.card}>
          <View style={styles.badgeRow}>
            <IntegrityBadge integrity={audit.integrityClass} />
            <Text style={[styles.caption, { color: colors.text.secondary }]}>{tReviewReason(audit.integrityReason)}</Text>
          </View>
          {audit.restoredAtMs !== null ? <Line testID="audit-restored">{t("audit.restored", { date: formatDateTime(audit.restoredAtMs) })}</Line> : null}
        </Card>
      </Section>

      <Section title={t("audit.sections.entryExit")}>
        <Card style={styles.card}>
          <KeyValueRow label={t("audit.declaredStart")} value={formatDateTime(audit.times.declaredStartAtMs)} />
          <KeyValueRow label={t("audit.actualStart")} value={audit.times.actualStartAtMs !== null ? formatDateTime(audit.times.actualStartAtMs) : "—"} />
          <KeyValueRow label={t("audit.end")} value={audit.times.endAtMs !== null ? formatDateTime(audit.times.endAtMs) : t("audit.openState")} />
          <KeyValueRow
            label={t("audit.arrival")}
            value={audit.arrival ? `${formatTime(audit.arrival.atMs)} · ${t(`audit.origin.${audit.arrival.origin}`)}` : t("audit.arrivalNone")}
          />
          {audit.arrival?.manualArrival ? <Line muted>{t("audit.arrivalManualFar")}</Line> : null}
          <KeyValueRow
            label={t("audit.firstExit")}
            value={
              audit.firstExit
                ? `${formatTime(audit.firstExit.atMs)} · ${audit.firstExit.reliable === true ? t("audit.reliable") : audit.firstExit.reliable === false ? t("audit.unreliable") : t("audit.reliabilityUnknown")}`
                : t("audit.firstExitNone")
            }
          />
          {spatial.map((r) => (
            <Line key={r.ledgerId} testID={`audit-spatial-${r.ledgerId}`} muted>
              {`${formatTime(r.atMs)} · ${r.detail.factType ? tSpatialType(r.detail.factType) : tLedgerIntent(r.intent)} · ${t(`audit.origin.${r.origin}`)} · ${reliabilityText(r)}`}
            </Line>
          ))}
        </Card>
      </Section>

      <Section title={t("audit.sections.edits")}>
        <Card style={styles.card}>
          {audit.original ? <Line>{t("audit.original", { range: timesText(audit.original) })}</Line> : null}
          {edits.length === 0 ? <Line muted>{t("audit.noEdits")}</Line> : null}
          {edits.map((r) => (
            <View key={r.ledgerId} testID={`audit-edit-${r.ledgerId}`} style={styles.item}>
              <Line>{`${formatDateTime(r.atMs)} · ${t(`audit.origin.${r.origin}`)}`}</Line>
              <Line muted>{t("audit.editBefore", { range: timesText(r.detail.before) })}</Line>
              <Line muted>{t("audit.editAfter", { range: timesText(r.detail.after) })}</Line>
              {(r.detail.clippedBreaks ?? 0) + (r.detail.clippedTransits ?? 0) > 0 ? (
                <Line muted>{t("audit.clipped", { n: (r.detail.clippedBreaks ?? 0) + (r.detail.clippedTransits ?? 0) })}</Line>
              ) : null}
              <NoteLine row={r} />
              <UserLines row={r} />
            </View>
          ))}
          <KeyValueRow label={t("audit.latestNote")} value={audit.latestNote ?? t("audit.noNote")} />
        </Card>
      </Section>

      <Section title={t("audit.sections.conflicts")}>
        <Card style={styles.card}>
          {audit.conflicts.length === 0 ? <Line muted>{t("audit.noConflicts")}</Line> : null}
          {audit.conflicts.map((cf) => {
            const opened = byId.get(cf.openedLedgerId);
            return (
              <View key={cf.openedLedgerId} testID={`audit-conflict-${cf.openedLedgerId}`} style={styles.item}>
                <Line>{`${formatDateTime(cf.openedAtMs)} · ${t("audit.conflictOpened", { reason: opened ? tLedgerIntent(opened.intent) : cf.reason })}`}</Line>
                <Line muted>
                  {cf.resolvedBy && cf.resolvedAtMs !== null
                    ? t("audit.conflictResolved", { action: tLedgerIntent(cf.resolvedBy), time: formatDateTime(cf.resolvedAtMs) })
                    : t("audit.conflictPending")}
                </Line>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title={t("audit.sections.breaks")}>
        <Card style={styles.card}>
          <KeyValueRow
            label={t("audit.lunch")}
            value={
              audit.lunch.taken || audit.lunch.startAtMs !== null
                ? t("audit.lunchRange", { range: span(audit.lunch.startAtMs, audit.lunch.endAtMs), min: audit.lunch.deductedMinutes ?? 0 })
                : t("audit.lunchNone")
            }
          />
          {audit.lunch.interrupted ? <Line muted>{t("audit.lunchInterrupted")}</Line> : null}
          <Line muted>{t("audit.pauses", { n: audit.pauses.length })}</Line>
          {audit.pausesSource === "PRORATED" ? <Line muted>{t("audit.pausesProrated")}</Line> : null}
          {audit.pausesSource === "LEDGER" ? <Line muted>{t("audit.pausesFromLedger")}</Line> : null}
          {audit.breaksClipped ? <Line muted>{t("audit.breaksClipped")}</Line> : null}
          {c?.waiveFirstMeal ? <Line muted>{t("audit.waivedFirst")}</Line> : null}
          {c?.waiveSecondMeal ? <Line muted>{t("audit.waivedSecond")}</Line> : null}
          {c?.mealInterrupted ? <Line muted>{t("audit.mealInterrupted")}</Line> : null}
          {c?.restBreaksTaken === false ? <Line muted>{t("audit.restNotTaken")}</Line> : null}
          {c?.shiftExtended ? <Line muted>{t("audit.shiftExtended")}</Line> : null}
          {breaks.map((r) => (
            <Line key={r.ledgerId} muted>{`${formatTime(r.atMs)} · ${tLedgerIntent(r.intent)} · ${t(`audit.origin.${r.origin}`)}`}</Line>
          ))}
        </Card>
      </Section>

      <Section title={t("audit.sections.autoClose")}>
        <Card style={styles.card}>
          {autoRows.length === 0 ? <Line muted>{t("audit.noAutoClose")}</Line> : null}
          {autoRows.map((r) => (
            <View key={r.ledgerId} testID={`audit-auto-${r.ledgerId}`} style={styles.item}>
              <Line>
                {`${formatDateTime(r.atMs)} · ${tLedgerIntent(r.intent)}`}
                {r.kind === "AUTO_CLOSE" ? ` · ${causeLabel(r.detail.cause)}` : ""}
              </Line>
              {r.kind === "AUTO_CLOSE" && r.detail.confirmedOutside !== undefined ? (
                <Line muted>{r.detail.confirmedOutside ? t("audit.confirmedOutside") : t("audit.notConfirmedOutside")}</Line>
              ) : null}
            </View>
          ))}
        </Card>
      </Section>

      <Section title={t("audit.sections.seal")}>
        <Card style={styles.card}>
          <Line testID="audit-seal">{t(`audit.seal.${audit.seal.status}`, { n: audit.seal.eventCount ?? 0 })}</Line>
          {audit.seal.eventsAfter > 0 ? <Line testID="audit-seal-after" muted>{t("audit.sealAfter", { n: audit.seal.eventsAfter })}</Line> : null}
          <Line testID="audit-chain" muted>{t(`audit.chain.${audit.chain}`)}</Line>
        </Card>
      </Section>

      <Section title={t("audit.sections.gaps")}>
        <Card style={styles.card}>
          {audit.trailGaps.length === 0 && monitoring.length === 0 ? <Line muted>{t("audit.noGaps")}</Line> : null}
          {audit.trailGaps.map((g, i) => (
            <Line key={`gap-${i}`} testID={`audit-gap-${i}`} muted>
              {t(g.kind === "retention" ? "audit.gapRetention" : "audit.gapRecording", { range: `${formatTime(g.fromMs)} – ${formatTime(g.toMs)}` })}
            </Line>
          ))}
          {monitoring.map((r) => (
            <Line key={r.ledgerId} testID={`audit-monitoring-${r.ledgerId}`} muted>
              {`${formatTime(r.atMs)} · ${r.kind === "CLOCK" ? t("audit.clockDrift", { sec: Math.round((r.detail.driftMs ?? 0) / 1000) }) : monitoringText(r)}`}
            </Line>
          ))}
        </Card>
      </Section>

      {audit.notRecorded.length > 0 ? (
        <Section title={t("audit.sections.missing")}>
          <Card style={styles.card}>
            {audit.notRecorded.map((code) => (
              <Line key={code} testID={`audit-missing-${code}`} muted>
                {`${t("audit.notRecorded")}: ${t(`audit.missing.${code}`)}`}
              </Line>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={t("audit.sections.events")}>
        <Card style={styles.card}>
          {rows.map((r) => (
            <Line key={r.ledgerId} testID={`audit-row-${r.ledgerId}`} muted>
              {`${formatTime(r.atMs)} · ${t(`audit.origin.${r.origin}`)} · ${tLedgerIntent(r.intent)}`}
            </Line>
          ))}
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: TOKENS.spacing.md },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
  item: { gap: TOKENS.spacing.xxs, paddingVertical: TOKENS.spacing.xs },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, flexWrap: "wrap" },
  caption: { ...FONT.caption },
  line: { ...FONT.bodySmall },
});
