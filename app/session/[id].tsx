import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";

import dayjs from "../../src/utils/dayjsSetup";
import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useLanguage } from "../../src/context/LanguageContext";
import type { translations } from "../../src/utils/i18n";
import { ICONS } from "../../src/constants/icons";
import {
  ScreenContainer,
  PageHeader,
  Card,
  Button,
  IntegrityBadge,
  SessionTimeline,
  EmptyState,
  LoadingOverlay,
  Section,
  Input,
} from "../../src/components/ui";
import type { TimelineEvent } from "../../src/components/ui/SessionTimeline";
import { DeleteSessionModal } from "../../src/components/modals/DeleteSessionModal";
import { useSessionDetail, toIntegrityBadgeType } from "../../src/core/hooks/dualTracker";
import type { LedgerEntry } from "../../src/core/contracts/domain";

/** Etiquetas humanas para cada `LedgerEntry.intent` (blueprint §5.9). */
type TF = (key: keyof typeof translations.es, vars?: Record<string, string | number>) => string;

function intentLabel(t: TF, intent: string): string {
  switch (intent) {
    case "START_DAY":
      return t("session_intent_start");
    case "ARRIVAL_CONFIRMED":
      return t("session_intent_arrival");
    case "TRANSFER_START":
      return t("session_intent_transfer");
    case "EXIT_DETECTED":
      return t("session_intent_exit");
    case "EXIT_RESOLVED_CONTINUE":
      return t("session_intent_continue");
    case "LUNCH_START":
      return t("session_intent_lunch_start");
    case "LUNCH_END":
      return t("session_intent_lunch_end");
    case "CLOSE_DAY":
      return t("session_intent_close");
    case "MANUAL_PATCH":
      return t("session_intent_manual");
    case "OS_KILL_RECOVERED":
      return t("session_intent_os_kill");
    case "RESOLVE_CONFLICT_KEEP_GPS":
    case "RESOLVE_CONFLICT_ACCEPT_MANUAL":
    case "RESOLVE_CONFLICT_SPLIT_CLOSE_ORIGINAL":
    case "RESOLVE_CONFLICT_SPLIT_CREATE_CONTINUATION":
      return t("session_intent_conflict");
    case "AUTO_CLOSE_SESSION_CAP":
      return t("session_intent_autoclose");
    default:
      return intent;
  }
}

const WARNING_REASON_CODES = new Set(["MANUAL_EDIT", "SESSION_CAP_12H", "OS_KILL_RECOVERED"]);

function timelineTypeFor(entry: LedgerEntry): TimelineEvent["type"] {
  if (entry.intent === "START_DAY") return "start";
  if (entry.intent === "ARRIVAL_CONFIRMED" || entry.intent === "EXIT_RESOLVED_CONTINUE") {
    return "arrival";
  }
  if (entry.intent === "CLOSE_DAY" || entry.intent === "AUTO_CLOSE_SESSION_CAP") {
    return "close";
  }
  const reasonCode = entry.reasonCode ?? "";
  if (reasonCode.includes("CONFLICT") || WARNING_REASON_CODES.has(reasonCode)) {
    return "warning";
  }
  return "note";
}

function ledgerEntryToTimelineEvent(t: TF, entry: LedgerEntry): TimelineEvent {
  return {
    id: entry.id,
    title: intentLabel(t, entry.intent),
    time: dayjs(entry.timestampMs).format("DD MMM, HH:mm"),
    subtitle: entry.reason ?? undefined,
    type: timelineTypeFor(entry),
  };
}

/** Formatea milisegundos como "Xh Ym"; "—" si falta un extremo. */
function formatNetHours(
  actualStartAtMs: number | null,
  endAtMs: number | null,
  totalPausedMs: number,
): string {
  if (actualStartAtMs === null || endAtMs === null) return "—";
  const netMs = Math.max(0, endAtMs - actualStartAtMs - totalPausedMs);
  const totalMinutes = Math.round(netMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Formulario inline de edición manual (NOTA capa app §EditSessionModal): el
 * modal existente no expone los valores editados hacia afuera (`onSave` sin
 * argumentos), así que esta pantalla construye su propio formulario con
 * `Input` en lugar de depender de su estado interno.
 */
function InlineEditForm({
  initialStartAtMs,
  initialEndAtMs,
  onCancel,
  onSubmit,
}: {
  initialStartAtMs: number | null;
  initialEndAtMs: number | null;
  onCancel: () => void;
  onSubmit: (input: { startAtMs?: number; endAtMs?: number; note: string }) => Promise<void>;
}) {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const [startText, setStartText] = useState(
    initialStartAtMs !== null ? dayjs(initialStartAtMs).format("YYYY-MM-DD HH:mm") : "",
  );
  const [endText, setEndText] = useState(
    initialEndAtMs !== null ? dayjs(initialEndAtMs).format("YYYY-MM-DD HH:mm") : "",
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const noteMissing = note.trim().length === 0;

  const handleSubmit = async () => {
    if (noteMissing) {
      setFormError("La nota es obligatoria para justificar un ajuste manual.");
      return;
    }
    const parsedStart = startText.trim().length > 0 ? dayjs(startText, "YYYY-MM-DD HH:mm") : null;
    const parsedEnd = endText.trim().length > 0 ? dayjs(endText, "YYYY-MM-DD HH:mm") : null;
    if (parsedStart && !parsedStart.isValid()) {
      setFormError("El inicio no tiene un formato válido (AAAA-MM-DD HH:mm).");
      return;
    }
    if (parsedEnd && !parsedEnd.isValid()) {
      setFormError("El fin no tiene un formato válido (AAAA-MM-DD HH:mm).");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        startAtMs: parsedStart ? parsedStart.valueOf() : undefined,
        endAtMs: parsedEnd ? parsedEnd.valueOf() : undefined,
        note: note.trim(),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={styles.editCard}>
      <Text style={styles.editTitle}>Editar jornada</Text>
      <Input
        label={t("session_start_label")}
        value={startText}
        onChangeText={setStartText}
        placeholder="2026-01-15 08:00"
        autoCapitalize="none"
      />
      <Input
        label={t("session_end_label")}
        value={endText}
        onChangeText={setEndText}
        placeholder="2026-01-15 17:00"
        autoCapitalize="none"
      />
      <Input
        label={t("session_edit_note_label")}
        value={note}
        onChangeText={setNote}
        placeholder={t("session_edit_note_placeholder")}
        multiline
        numberOfLines={3}
        error={formError ?? undefined}
      />
      <View style={styles.editActions}>
        <Button label={t("session_cancel")} variant="secondary" onPress={onCancel} style={styles.editButton} />
        <Button
          label={t("session_save_adjustment")}
          variant="primary"
          onPress={handleSubmit}
          isLoading={submitting}
          disabled={noteMissing || submitting}
          style={styles.editButton}
        />
      </View>
    </Card>
  );
}

export default function SessionDetailScreen() {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const sessionId = id ? Number(id) : NaN;
  const validId = Number.isFinite(sessionId) ? sessionId : null;

  const { loading, error, session, site, ledgerEntries, traceCount, patch, remove } =
    useSessionDetail(validId);

  const [editing, setEditing] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleBack = () => {
    if (from === "hoy") {
      router.replace("/(tabs)");
    } else if (from === "history" || from === "historial") {
      router.replace("/(tabs)/history");
    } else {
      router.back();
    }
  };

  const timelineEvents = useMemo(
    () => ledgerEntries.map((e) => ledgerEntryToTimelineEvent(t, e)),
    [ledgerEntries, t],
  );

  const netHours = session
    ? formatNetHours(session.actualStartAtMs, session.endAtMs, session.totalPausedMs)
    : "—";

  if (loading) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <PageHeader title={t("session_title")} showBack onBack={handleBack} />
        <LoadingOverlay visible message={t("session_loading")} />
      </ScreenContainer>
    );
  }

  if (!loading && !error && !session) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <PageHeader title={t("session_title")} showBack onBack={handleBack} />
        <EmptyState
          title={t("session_not_found")}
          description={t("session_not_found_desc")}
          icon="document-text-outline"
        />
        <View style={styles.notFoundAction}>
          <Button label={t("session_back")} variant="primary" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !session) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <PageHeader title={t("session_title")} showBack onBack={handleBack} />
        <EmptyState
          title={t("session_load_error")}
          description={error}
          icon="alert-circle-outline"
        />
      </ScreenContainer>
    );
  }

  if (!session) return null;

  return (
    <ScreenContainer noPadding>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader title={t("session_title")} showBack onBack={handleBack} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {session.isDeleted && (
          <View style={styles.deletedBanner}>
            <Text style={styles.deletedBannerText}>Eliminada</Text>
          </View>
        )}

        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Text style={styles.siteAlias}>{site?.alias ?? t("session_no_site")}</Text>
            <IntegrityBadge type={toIntegrityBadgeType(session.integrityClass)} />
          </View>
          <Text style={styles.dateCaption}>
            {session.dateString ?? dayjs(session.declaredStartAtMs).format("DD MMM YYYY")}
          </Text>
        </Card>

        <Section title={t("session_totals")}>
          <Card>
            <View style={styles.totalsRow}>
              <View style={styles.totalsItem}>
                <Text style={styles.totalsLabel}>Horas netas</Text>
                <Text style={styles.totalsValue}>{netHours}</Text>
              </View>
              <View style={styles.totalsItem}>
                <Text style={styles.totalsLabel}>Almuerzo</Text>
                <Text style={styles.totalsValue}>
                  {session.lunch.deductedMinutes !== null
                    ? `${session.lunch.deductedMinutes} min`
                    : "—"}
                </Text>
              </View>
            </View>
          </Card>
        </Section>

        <Section title={t("session_work_lines")}>
          <Card>
            <Text style={styles.policyCaption}>Política: {session.policyId}</Text>
            <Text style={styles.payrollNote}>
              Horas trabajadas de esta sesión: {netHours}. El desglose regular/OT/tránsito proviene
              de PayrollEngineService y solo se calcula en Reportes — esta vista no importa el motor
              de nómina directamente.
            </Text>
            <Button
              label={t("session_view_breakdown")}
              variant="secondary"
              onPress={() => router.push("/(tabs)/reports")}
              style={styles.reportsButton}
            />
          </Card>
        </Section>

        <SessionTimeline events={timelineEvents} />

        <Section title={t("session_spatial")}>
          <Card>
            <Text style={styles.spatialText}>
              {traceCount === 0 ? t("session_zone_validated") : t("session_trace_available")}
            </Text>
            <Button
              label={t("session_view_trace")}
              variant="secondary"
              onPress={() => router.push(`/session/${validId}/trace`)}
              style={styles.reportsButton}
            />
          </Card>
        </Section>

        {session.manualEditNote ? (
          <Section title={t("session_notes")}>
            <Card>
              <Text style={styles.noteText}>{session.manualEditNote}</Text>
            </Card>
          </Section>
        ) : null}

        {!session.isDeleted && editing && (
          <View style={styles.editWrapper}>
            <InlineEditForm
              initialStartAtMs={session.actualStartAtMs}
              initialEndAtMs={session.endAtMs}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                await patch(input);
                setEditing(false);
              }}
            />
          </View>
        )}
      </ScrollView>

      {!session.isDeleted && !editing && (
        <View style={styles.footer}>
          <Button
            label={t("session_edit")}
            variant="secondary"
            iconName={ICONS.actions.edit as any}
            onPress={() => setEditing(true)}
            style={styles.footerButton}
          />
          <Button
            label={t("session_delete")}
            variant="danger"
            iconName={ICONS.actions.delete as any}
            onPress={() => setDeleteVisible(true)}
            style={styles.footerButton}
          />
        </View>
      )}

      <DeleteSessionModal
        visible={deleteVisible}
        onCancel={() => setDeleteVisible(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await remove();
            setDeleteVisible(false);
            router.back();
          } finally {
            setDeleting(false);
          }
        }}
      />
      {deleting ? <LoadingOverlay visible message={t("session_deleting")} /> : null}
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  scrollContent: {
    paddingBottom: tokens.spacing["4xl"],
  },
  notFoundAction: {
    paddingHorizontal: tokens.layout.screenPadding,
    marginTop: tokens.spacing.lg,
  },
  deletedBanner: {
    marginHorizontal: tokens.layout.screenPadding,
    marginBottom: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.sm,
    backgroundColor: `${tokens.colors.status.danger}22`,
    borderWidth: 1,
    borderColor: tokens.colors.status.danger,
  },
  deletedBannerText: {
    ...FONT.bodyStrong,
    color: tokens.colors.status.danger,
    textAlign: "center",
  },
  headerCard: {
    marginHorizontal: tokens.layout.screenPadding,
    marginBottom: tokens.spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  siteAlias: { ...FONT.h2, color: tokens.colors.text.primary },
  dateCaption: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
    marginTop: tokens.spacing.xs,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  totalsItem: { flex: 1 },
  totalsLabel: { ...FONT.caption, color: tokens.colors.text.muted },
  totalsValue: { ...FONT.h3, color: tokens.colors.text.primary, marginTop: 2 },
  policyCaption: {
    ...FONT.caption,
    color: tokens.colors.text.muted,
    marginBottom: tokens.spacing.sm,
  },
  payrollNote: { ...FONT.body, color: tokens.colors.text.secondary },
  reportsButton: { marginTop: tokens.spacing.md },
  spatialText: {
    ...FONT.bodyStrong,
    color: tokens.colors.text.primary,
    marginBottom: tokens.spacing.sm,
  },
  noteText: { ...FONT.body, color: tokens.colors.text.secondary },
  editWrapper: { paddingHorizontal: tokens.layout.screenPadding, marginTop: tokens.spacing.md },
  editCard: {},
  editTitle: { ...FONT.h3, color: tokens.colors.text.primary, marginBottom: tokens.spacing.md },
  editActions: { flexDirection: "row", gap: tokens.spacing.md, marginTop: tokens.spacing.sm },
  editButton: { flex: 1 },
  footer: {
    flexDirection: "row",
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.layout.screenPadding,
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.background,
  },
  footerButton: { flex: 1 },
  });
}
