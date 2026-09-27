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
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, EmptyState, IntegrityBadge, ScreenContainer, Section, SessionTimeline, ledgerToTimeline } from "../../src/components/ui";
import { AddNoteModal, DeleteSessionModal, EditSessionModal } from "../../src/components/modals";
import { KeyValueRow, ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { LedgerEntry, PayrollLineKind } from "../../src/core/contracts";
import { useClock, useQuery, useWorkTracker } from "../../src/core/hooks";
import { selectCertification, selectComputedSessions, selectIsHydrated, selectSessionById } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatCurrency, formatDate, formatTime } from "../../src/utils/dateUtils";

const LINE_LABEL: Record<PayrollLineKind, string> = {
  REGULAR: "reports.regular",
  OVERTIME_DAILY: "reports.overtime",
  OVERTIME_WEEKLY: "reports.overtime",
  OVERTIME_DOUBLE: "reports.doubleTime",
  TRANSIT: "reports.transit",
  LUNCH_DEDUCTION: "reports.lunch",
  PAUSE_DEDUCTION: "reports.lunch",
};

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
  const [modal, setModal] = useState<null | "EDIT" | "DELETE" | "NOTE">(null);
  const [busy, setBusy] = useState(false);

  const session = Number.isFinite(sessionId) ? selectSessionById(state, sessionId) : null;
  const updatedAt = session?.bookkeeping.updatedAtMs ?? 0;
  const ledger = useQuery(() => queries.loadSessionLedger(sessionId), [sessionId, updatedAt]);
  const trace = useQuery(() => queries.loadTrace(sessionId), [sessionId, updatedAt]);
  const lines = useQuery(() => (session ? queries.sessionLines(session) : Promise.resolve([])), [sessionId, updatedAt]);

  if (!selectIsHydrated(state)) return <ScreenStatusBanner status="loading" message={t("common.loading")} />;
  if (!session) {
    return (
      <ScreenContainer>
        <EmptyState title={t("session.notFound")} icon="alert-circle-outline" />
        <Button label={t("notFound.goHome")} onPress={() => router.replace("/(tabs)")} />
      </ScreenContainer>
    );
  }

  const computed = selectComputedSessions(state, nowMs, [session])[0];
  const cert = selectCertification(state, session);
  const deleted = session.bookkeeping.isDeleted;
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
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
    <ScreenContainer noPadding>
      <Stack.Screen options={{ title: formatDate(start) }} />
      <ScrollView contentContainerStyle={styles.content}>
        {deleted ? <ScreenStatusBanner status="degraded" message={t("session.deletedBanner")} /> : null}
        {session.integrityClass === "CONFLICT" && !deleted ? (
          <ScreenStatusBanner status="conflict" message={t("today.conflictBanner")} onPress={() => router.push("/system/conflict")} />
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: TOKENS.colors.text.primary }]} numberOfLines={2}>
            {computed.site?.alias ?? t("today.noDestination")}
          </Text>
          <IntegrityBadge integrity={session.integrityClass} blocked={cert.blocked} />
        </View>
        {cert.blocked ? <Text style={[styles.caption, { color: TOKENS.colors.status.warning }]}>{t("integrity.blockedDetail")}</Text> : null}
        <Text style={[styles.caption, { color: TOKENS.colors.text.secondary }]}>
          {formatTime(start)} – {session.endAtMs ? formatTime(session.endAtMs) : "…"} · {t(`states.${session.domainStatus}.label`)}
        </Text>

        <Card style={styles.card}>
          <KeyValueRow label={t("today.netHours")} value={computed.preview ? `${(computed.preview.netMinutes / 60).toFixed(2)} ${t("common.hours")}` : "—"} />
          <KeyValueRow label={t("today.estimate")} value={computed.preview ? formatCurrency(computed.preview.grossEstimate) : "—"} emphasis />
        </Card>

        <Section title={t("session.lines")}>
          <Card style={styles.card}>
            {lines.loading ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.loading")}</Text> : null}
            {(lines.data ?? []).map((l, i) => (
              <KeyValueRow key={`${l.kind}-${i}`} label={`${t(LINE_LABEL[l.kind])} · ${l.minutes} ${t("common.minutes")} × ${formatCurrency(l.rate)}`} value={formatCurrency(l.amount)} />
            ))}
            {!lines.loading && (lines.data ?? []).length === 0 ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.noData")}</Text> : null}
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
            {cert.unreadable.includes("note") ? t("fieldCrypto.unreadableNote") : (session.bookkeeping.manualNote ?? t("session.noNotes"))}
          </Text>
          {!deleted ? <Button label={t("session.addNote")} size="sm" variant="ghost" onPress={() => setModal("NOTE")} /> : null}
        </Section>
      </ScrollView>

      {!deleted ? (
        <View style={[styles.footer, { borderColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.surface }]}>
          <Button label={t("common.edit")} variant="secondary" style={styles.flex} onPress={() => setModal("EDIT")} />
          {/* Eliminar solo en sesiones cerradas (interpretación: no se borra una jornada en curso). */}
          <Button label={t("common.delete")} variant="danger" style={styles.flex} disabled={session.domainStatus !== "CERRADA"} onPress={() => setModal("DELETE")} />
        </View>
      ) : null}

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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: 120 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.md },
  title: { ...FONT.h2, flex: 1 },
  caption: { ...FONT.caption },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  policy: { ...FONT.caption, marginTop: TOKENS.spacing.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: TOKENS.spacing.md, padding: TOKENS.spacing.lg, borderTopWidth: 1 },
  flex: { flex: 1 },
});
