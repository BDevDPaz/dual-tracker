/**
 * system/conflict.tsx — Resolución de CONFLICT (Producto §5.16). NUEVO.
 * Por cada sesión por revisar: hecho A (GPS), hecho B (manual/auto),
 * diferencia en minutos e impacto estimado en nómina (selector, no cálculo
 * en vista). Decisiones: Conservar GPS; Aceptar ajuste manual (exige nota);
 * Dividir en dos sesiones si hay solape. Cada decisión es una intención al
 * SessionEngine + asiento nuevo en el ledger. No existe "descartar" sin autor;
 * mientras haya conflictos, el back queda bloqueado.
 * RESOLVE_SPLIT divide la jornada en dos (spec v1.3 §5.4).
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { ConfirmActionModal } from "../../src/components/modals";
import { Button, Card, EmptyState, Input, IntegrityBadge, ModalShell, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { KeyValueRow } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useAutoRefresh, useBusyAction, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import { selectConflictViews, type ConflictView } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatCurrency, formatDate, formatTime } from "../../src/utils/dateUtils";

export default function ConflictScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { state } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { refreshControl } = usePullToRefresh({ safeArea: "edge" });
  useAutoRefresh();
  const views = selectConflictViews(state, nowMs);
  const hasConflicts = views.length > 0;
  const [blockedNotice, setBlockedNotice] = useState(false);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (!hasConflicts) return;
      e.preventDefault();
      setBlockedNotice(true);
    });
    return unsub;
  }, [navigation, hasConflicts]);

  if (!hasConflicts) {
    return (
      <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
        <EmptyState title={t("conflict.none")} icon="checkmark-circle-outline" />
        <Button label={t("common.close")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
      </ScreenScroll>
    );
  }

  return (
    <>
      <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
        {views.map((v) => (
          <ConflictCard key={v.session.id} view={v} onOpenSession={() => router.push(`/session/${v.session.id}`)} />
        ))}
      </ScreenScroll>
      <ModalShell
        visible={blockedNotice}
        title={t("conflict.title")}
        description={t("conflict.blockedBack")}
        tone="warning"
        onClose={() => setBlockedNotice(false)}
        primaryAction={{ label: t("common.ok"), onPress: () => setBlockedNotice(false), variant: "primary" }}
      />
    </>
  );
}

function ConflictCard({ view, onOpenSession }: { view: ConflictView; onOpenSession: () => void }) {
  const { emit } = useWorkTracker();
  const [note, setNote] = useState(view.session.bookkeeping.manualNote ?? "");
  const [splitOpen, setSplitOpen] = useState(false);
  const { busy, run: guard } = useBusyAction();
  const chain = useFormFocusChain(FORM_FIELDS.conflictNote);
  const range = (r: { startAtMs: number; endAtMs: number | null } | null) =>
    r ? `${formatTime(r.startAtMs)} – ${r.endAtMs ? formatTime(r.endAtMs) : "…"}` : "—";

  const run = (intent: Parameters<typeof emit>[0]) =>
    guard(async () => {
      const res = await emit(intent);
      if (res.ok) setSplitOpen(false);
      return res;
    });

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>
          {view.site?.alias ?? t("today.noDestination")} · {formatDate(view.factB.startAtMs)}
        </Text>
        <IntegrityBadge integrity={view.session.integrityClass} blocked={(view.session.bookkeeping.certificationBlockers ?? []).length > 0} />
      </View>
      <Text style={[styles.caption, { color: TOKENS.colors.text.muted }]}>{view.reason}</Text>
      <KeyValueRow label={t("conflict.factA")} value={range(view.factA)} />
      <KeyValueRow label={t("conflict.factB")} value={range(view.factB)} />
      <KeyValueRow label={t("conflict.diff")} value={view.diffMinutes !== null ? `${view.diffMinutes > 0 ? "+" : ""}${view.diffMinutes} ${t("common.minutes")}` : "—"} />
      <KeyValueRow label={t("conflict.payrollImpact")} value={view.payrollImpact !== null ? formatCurrency(view.payrollImpact) : "—"} emphasis />
      <Button label={t("cta.reviewSession")} size="sm" variant="ghost" onPress={onOpenSession} />

      <Input {...chain.props("note")} placeholder={t("conflict.notePlaceholder")} value={note} onChangeText={setNote} multiline />
      <Button label={t("conflict.keepGps")} disabled={busy || !view.factA} onPress={() => void run({ type: "RESOLVE_KEEP_GPS", sessionId: view.session.id, note: note.trim() || null })} />
      <Button
        label={t("conflict.acceptManual")}
        variant="secondary"
        disabled={busy || note.trim().length === 0}
        onPress={() => void run({ type: "RESOLVE_MANUAL", sessionId: view.session.id, note: note.trim() })}
      />
      {view.canSplit ? (
        <Button
          label={t("conflict.split")}
          variant="ghost"
          disabled={busy || note.trim().length === 0}
          onPress={() => setSplitOpen(true)}
        />
      ) : null}
      <ConfirmActionModal
        visible={splitOpen}
        title={t("conflict.splitTitle")}
        description={t("conflict.splitBody")}
        confirmLabel={t("conflict.split")}
        tone="warning"
        busy={busy}
        onCancel={() => setSplitOpen(false)}
        onConfirm={() =>
          void run({ type: "RESOLVE_SPLIT", sessionId: view.session.id, splitAtMs: view.factA?.endAtMs ?? view.factB.startAtMs, note: note.trim() })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong, flex: 1 },
  caption: { ...FONT.caption },
});
