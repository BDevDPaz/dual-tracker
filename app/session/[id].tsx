/**
 * session/[id].tsx — Detalle de sesión (Producto §5.9). REDISEÑO.
 * Qué se declaró, qué confirmó el GPS, qué se editó y cómo se pagó:
 * alias + IntegrityBadge, totales, líneas laborales (policyId visible),
 * SessionTimeline alimentado por LedgerEntry (no hitos en duro), bloque
 * espacial → trace, notas y footer Editar | Eliminar.
 * Intenciones: PATCH_SESSION, DELETE_SESSION, ADD_NOTE, OPEN_TRACE.
 * Sesión eliminada → banner "Eliminada" y solo lectura.
 */
import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrivalMark } from "../../src/components/brand/ArrivalMark";
import { Button, Card, EmptyState, IntegrityBadge, SAFE_EDGES, ScreenContainer, ScreenScroll, Section, SessionTimeline, ledgerToTimeline } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { ScreenTips } from "../../src/components/support/ScreenTips";
import { AddNoteModal, DeleteSessionModal, EditSessionModal } from "../../src/components/modals";
import { KeyValueRow, ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import type { LedgerEntry } from "../../src/core/contracts";
import { useAutoRefresh, useClock, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
import {
  formatCents,
  formatHundredths,
  minutesToHundredths,
  moneyCents,
  selectCertification,
  selectComputedSessions,
  selectIsHydrated,
  selectSessionById,
  trimDisplayNote,
} from "../../src/core/selectors";
import { t, tLineKind } from "../../src/i18n";
import { formatCurrency, formatDate, formatTime, formatUiDecimal } from "../../src/utils/dateUtils";

function ledgerLabel(e: LedgerEntry): string {
  const key = `ledger.${e.intent}`;
  const v = t(key);
  return v === key ? e.intent : v;
}

export default function SessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(30_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [modal, setModal] = useState<null | "EDIT" | "DELETE" | "NOTE">(null);
  const [busy, setBusy] = useState(false);

  const session = Number.isFinite(sessionId) ? selectSessionById(state, sessionId) : null;
  const updatedAt = session?.bookkeeping.updatedAtMs ?? 0;
  const ledger = useQuery(() => queries.loadSessionLedger(sessionId), [sessionId, updatedAt], ["ledger"]);
  const trace = useQuery(() => queries.loadTrace(sessionId), [sessionId, updatedAt], ["trace"]);
  const lines = useQuery(() => (session ? queries.sessionLines(session) : Promise.resolve([])), [sessionId, updatedAt], ["sessions", "settings"]);

  if (!selectIsHydrated(state)) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }
  if (!session) {
    return (
      <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
        <EmptyState title={t("session.notFound")} icon="alert-circle-outline" />
        <Button label={t("notFound.goHome")} onPress={() => router.replace("/(tabs)")} />
      </ScreenScroll>
    );
  }

  const computed = selectComputedSessions(state, nowMs, [session])[0];
  const cert = selectCertification(state, session);
  const deleted = session.bookkeeping.isDeleted;
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  const lineRows = lines.data ?? [];
  const paidMinutes = lineRows.filter((l) => !l.kind.endsWith("DEDUCTION")).reduce((a, l) => a + l.minutes, 0);
  const paidCents = lineRows.reduce((a, l) => a + moneyCents(l.minutes, l.rate), 0);
  const useLines = lineRows.length > 0;
  const zeroDuration = session.domainStatus === "CERRADA" && session.endAtMs != null && Math.round((session.endAtMs - start) / 60000) <= 0;
  const note = session.bookkeeping.manualNote ? trimDisplayNote(session.bookkeeping.manualNote) : "";
  const facts = trace.data ?? [];
  const hasTrace = facts.some((f) => f.type === "BREADCRUMB");
  const hasEnter = facts.some((f) => f.type === "ENTER" && f.reliable);

  const run = async (intent: Parameters<typeof emit>[0]) => {
    setBusy(true);
    const res = await emit(intent);
    setBusy(false);
    if (res.ok) setModal(null);
  };

  return (
    <ScreenScroll
      edges={SAFE_EDGES.stack}
      refreshControl={refreshControl}
      footer={
        !deleted ? (
          <View style={styles.footer}>
            <Button label={t("common.edit")} variant="secondary" style={styles.flex} onPress={() => setModal("EDIT")} />
            <Button label={t("common.delete")} variant="danger" style={styles.flex} disabled={session.domainStatus !== "CERRADA"} onPress={() => setModal("DELETE")} />
          </View>
        ) : null
      }
    >
      <Stack.Screen options={{ title: formatDate(start), headerRight: () => <HelpButton screen="session" /> }} />
        <ScreenTips screen="session" sessionState={session.domainStatus} siteCount={0} batteryRestricted={false} provisionalSeal={false} hasSplitRow={false} hasZeroOmitted={false} />
        {deleted ? <ScreenStatusBanner status="degraded" message={t("session.deletedBanner")} /> : null}
        {session.integrityClass === "CONFLICT" && !deleted ? (
          <ScreenStatusBanner status="conflict" message={t("today.conflictBanner")} onPress={() => router.push("/system/conflict")} />
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: TOKENS.colors.text.primary }]} numberOfLines={2}>
            {computed.siteLabel || computed.site?.alias || t("today.noDestination")}
          </Text>
          <IntegrityBadge integrity={session.integrityClass} blocked={cert.blocked} />
        </View>
        {cert.blocked ? <Text style={[styles.caption, { color: TOKENS.colors.status.warning }]}>{t("integrity.blockedDetail")}</Text> : null}
        <View style={styles.stateLine}>
          {session.domainStatus === "ACTIVA" ? <ArrivalMark size={ICON.lg} decorative /> : null}
          <Text style={[styles.caption, styles.stateCaption, { color: TOKENS.colors.text.secondary }]}>
            {formatTime(start)} – {session.endAtMs ? formatTime(session.endAtMs) : "…"} · {t(`states.${session.domainStatus}.label`)}
          </Text>
        </View>
        {zeroDuration ? <Text style={[styles.caption, { color: TOKENS.colors.status.warning }]}>{t("history.zeroDuration")}</Text> : null}

        <Card style={styles.card}>
          <KeyValueRow
            label={t("today.netHours")}
            value={
              useLines
                ? formatUiDecimal(`${formatHundredths(minutesToHundredths(paidMinutes))} ${t("common.hours")}`)
                : computed.preview
                  ? formatUiDecimal(`${formatHundredths(minutesToHundredths(computed.preview.netMinutes))} ${t("common.hours")}`)
                  : "—"
            }
          />
          <KeyValueRow
            label={t("today.estimate")}
            value={useLines ? formatCents(paidCents) : computed.preview ? formatCurrency(computed.preview.grossEstimate) : "—"}
            emphasis
          />
        </Card>

        <Section title={t("session.lines")}>
          <Card style={styles.card}>
            {lines.loading ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.loading")}</Text> : null}
            {lineRows.map((l, i) => (
              <KeyValueRow
                key={`${l.dateString}-${l.kind}-${i}`}
                label={`${l.dateString} · ${tLineKind(l.kind)} · ${l.minutes} ${t("common.minutes")} × ${formatCurrency(l.rate)}`}
                value={formatCurrency(l.amount)}
              />
            ))}
            {!lines.loading && lineRows.length === 0 ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.noData")}</Text> : null}
            <Text style={[styles.policy, { color: TOKENS.colors.text.muted }]}>
              {t("session.policy")}: {session.policyId}
            </Text>
          </Card>
        </Section>

        <SessionTimeline
          title={t("session.timeline")}
          emptyText={ledger.loading ? t("common.loading") : t("common.noData")}
          events={ledgerToTimeline(ledger.data ?? [], ledgerLabel)}
        />

        <Card style={styles.card}>
          <Text style={[styles.caption, { color: TOKENS.colors.text.primary }]}>
            {hasTrace ? t("session.spatialTrace") : hasEnter ? t("session.spatialValidated") : t("session.spatialNone")}
          </Text>
          <Button label={t("session.viewTrace")} size="sm" variant="secondary" iconName="map-outline" onPress={() => router.push(`/session/${session.id}/trace`)} />
        </Card>

        <Section title={t("session.notes")}>
          <Text style={{ color: session.bookkeeping.manualNote ? TOKENS.colors.text.primary : TOKENS.colors.text.muted }}>
            {cert.unreadable.includes("note") ? t("fieldCrypto.unreadableNote") : note || t("session.noNotes")}
          </Text>
          {!deleted ? <Button label={t("session.addNote")} size="sm" variant="ghost" onPress={() => setModal("NOTE")} /> : null}
        </Section>
      {/* Eliminar solo en sesiones cerradas (interpretación: no se borra una jornada en curso). */}

      <EditSessionModal
        visible={modal === "EDIT"}
        session={session}
        busy={busy}
        onCancel={() => setModal(null)}
        checkOverlap={queries.checkOverlap}
        onSave={(p) => void run({ type: "PATCH_SESSION", sessionId: session.id, declaredStartAtMs: p.declaredStartAtMs, endAtMs: p.endAtMs, note: p.note })}
      />
      <DeleteSessionModal visible={modal === "DELETE"} busy={busy} onCancel={() => setModal(null)} onConfirm={() => void run({ type: "DELETE_SESSION", sessionId: session.id })} />
      <AddNoteModal
        visible={modal === "NOTE"}
        title={t("modals.noteTitle")}
        busy={busy}
        onCancel={() => setModal(null)}
        onSave={(note) => void run({ type: "ADD_NOTE", sessionId: session.id, note })}
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: TOKENS.spacing.md },
  title: { ...FONT.h2, flex: 1 },
  caption: { ...FONT.caption },
  stateLine: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  stateCaption: { flex: 1 },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  policy: { ...FONT.caption, marginTop: TOKENS.spacing.sm },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.md },
  flex: { flex: 1 },
});
