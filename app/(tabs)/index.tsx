/**
 * (tabs)/index.tsx — Hoy: mando de jornada (Producto §5.7). REDISEÑO.
 * Compone PageHeader, SystemHealthBlock, OperationalHeroCard,
 * DailySummaryBlock y la zona de CTAs según getSessionStateUI. Monta
 * DailySetupModal, LunchModal y ExitDetectionModal. No calcula horas: todo
 * sale de selectores; toda mutación es una ViewIntent.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  Chip,
  GpsExceptionCard,
  Input,
  LiveShiftPanel,
  ModalShell,
  PageHeader,
  PrimaryButton,
  SAFE_EDGES,
  ScreenScroll,
  SystemHealthBlock,
  EmptyState,
  selectGpsExceptionKind,
  type GpsExceptionKind,
} from "../../src/components/ui";
import { AddNoteModal, ConfirmActionModal, DailySetupModal, ExitDetectionModal, LunchModal } from "../../src/components/modals";
import { OrphanReviewCard, ScreenStatusBanner } from "../../src/components/blocks";
import { ScreenTips } from "../../src/components/support/ScreenTips";
import { EXTEND_PROMPT_MS } from "../../src/constants/tasks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useToast } from "../../src/context/ToastContext";
import { gpsNoticeState } from "../../src/core/monitoringState";
import type { SiteDraft, ViewIntent } from "../../src/core/contracts";
import { useAutoRefresh, useBusyAction, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import {
  getSessionStateUI,
  selectActiveSession,
  selectCurrentTargetSite,
  selectHasConflict,
  selectActiveCrossesWorkday,
  selectLastSessionToday,
  selectLedgerHealth,
  selectHealth,
  selectCryptoHealth,
  selectLunchElapsedMs,
  selectSessionState,
  selectSiteById,
  selectSites,
  selectSystemHealth,
  selectTodaySummary,
  selectUiRequests,
  sessionSiteLabel,
  type HeroAction,
} from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDate, formatDuration, formatTime, wallMinutesOnOrAfter } from "../../src/utils/dateUtils";

type OpenModal = null | "SETUP_START" | "SETUP_TRANSIT" | "LUNCH_CLOSE_DAY" | "LUNCH_CLOSE_EXIT" | "LUNCH_SUPERVISOR" | "EXIT" | "CANCEL_TRANSFER" | "NOTE" | "CANCEL_DAY" | "EXTEND";

export default function TodayScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, emit } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { showToast } = useToast();
  const [dismissedGps, setDismissedGps] = useState<GpsExceptionKind | null>(null);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [modal, setModal] = useState<OpenModal>(null);
  const [cancelNote, setCancelNote] = useState("");
  const { busy, run: guard } = useBusyAction();

  const sessionState = selectSessionState(state, nowMs);
  const ui = getSessionStateUI(sessionState);
  const active = selectActiveSession(state);
  const lastToday = selectLastSessionToday(state, nowMs);
  const target = selectCurrentTargetSite(state);
  const sites = selectSites(state);
  const health = selectSystemHealth(state);
  const healthRaw = selectHealth(state);
  const summary = selectTodaySummary(state, nowMs);
  const hasConflict = selectHasConflict(state);
  const uiRequests = selectUiRequests(state);
  const ledger = selectLedgerHealth(state);
  const crypto = selectCryptoHealth(state);

  // Peticiones de UI originadas fuera de la vista (notificación de salida, boot en SALIDA).
  useEffect(() => {
    if (uiRequests.openExitModal) setModal("EXIT");
    else if (uiRequests.openDailySetup) setModal(uiRequests.openDailySetup === "transit" ? "SETUP_TRANSIT" : "SETUP_START");
    else if (uiRequests.openExtendConfirm) setModal("EXTEND");
    else if (uiRequests.correctSessionId) router.push(`/session/${uiRequests.correctSessionId}`);
    else if (uiRequests.openHealth) router.push("/system/health");
    else if (uiRequests.openMoveSite) router.push("/sites/new");
    else if (uiRequests.openOrphanReview) {
      // La tarjeta de revisión ya está en Hoy. El aviso solo abre la app.
    } else if (!uiRequests.dismissArrival) return;
    void emit({ type: "CONSUME_UI_REQUEST" });
  }, [uiRequests.openExitModal, uiRequests.openDailySetup, uiRequests.openExtendConfirm, uiRequests.correctSessionId, uiRequests.openOrphanReview, uiRequests.openHealth, uiRequests.openMoveSite, uiRequests.dismissArrival, emit, router]);

  // Si el estado deja de ser SALIDA (p. ej. decidido desde la notificación), cerrar el hub.
  useEffect(() => {
    if (modal === "EXIT" && sessionState !== "SALIDA") setModal(null);
  }, [modal, sessionState]);

  const run = (intent: ViewIntent, after?: () => void) =>
    guard(async () => {
      const res = await emit(intent);
      if (res.ok) after?.();
      return res;
    });

  const onHeroAction = (action: HeroAction) => {
    switch (action) {
      case "OPEN_DAILY_SETUP_START":
      case "NEW_DAY":
        return setModal("SETUP_START");
      case "CANCEL_DAY":
        return setModal("CANCEL_DAY");
      case "VIEW_DESTINATION":
        return target ? router.push(`/sites/${target.id}`) : router.push("/sites");
      case "OPEN_LUNCH_CLOSE":
        return setModal("LUNCH_CLOSE_DAY");
      case "START_LUNCH":
        return void run({ type: "START_LUNCH" });
      case "RESUME":
        return void run({ type: "RESUME" });
      case "OPEN_LUNCH_FINISH":
        return setModal("LUNCH_SUPERVISOR");
      case "VIEW_STATUS":
        return active ? router.push(`/session/${active.id}`) : undefined;
      case "CANCEL_TRANSFER":
        setCancelNote("");
        return setModal("CANCEL_TRANSFER");
      case "OPEN_EXIT_MODAL":
        return setModal("EXIT");
      case "STAY_WORKING":
        return void run({ type: "STAY_WORKING" });
      case "REVIEW_SESSION":
        return lastToday ? router.push(`/session/${lastToday.id}`) : router.push("/(tabs)/history");
      case "CONFIRM_ARRIVAL":
        return void run({ type: "CONFIRM_ARRIVAL" });
    }
  };

  const onQuickCreate = async (draft: SiteDraft) => {
    try {
      const res = await emit({ type: "UPSERT_SITE", site: draft });
      return res.ok ? ((res.data as import("../../src/core/contracts").Site) ?? null) : null;
    } catch {
      return null;
    }
  };

  const noSitesNoSession = sites.length === 0 && !active;
  const visited = summary.visitedSiteIds.map((id) => selectSiteById(state, id)).filter((x) => !!x);
  const visitedCount = visited.length;
  const uncertified = health.degraded || (!!active && active.integrityClass !== "VALID") || !summary.certified;
  const gpsKind = selectGpsExceptionKind({
    sessionState,
    clockDrift: healthRaw.clockDriftExceeded,
    integrityReason: active?.bookkeeping.integrityReason ?? null,
    gps: gpsNoticeState({
      servicesEnabled: healthRaw.locationServicesEnabled,
      mocked: healthRaw.mockLocation,
      lastFixMs: healthRaw.lastSpatialFactAt,
      nowMs,
      sessionOpen: active !== null,
    }),
    monitoring: healthRaw.monitoringState,
  });

  const shiftStart = active ? (active.actualStartAtMs ?? active.declaredStartAtMs) : null;
  const canExtend =
    !!active &&
    shiftStart !== null &&
    sessionState !== "ESPERANDO" &&
    sessionState !== "CERRADA" &&
    sessionState !== "NO_INICIADA" &&
    nowMs - shiftStart >= EXTEND_PROMPT_MS &&
    active.bookkeeping.compliance?.shiftExtended !== true;
  const canErrand = (sessionState === "ACTIVA" || sessionState === "SALIDA") && !!active;

  const onGpsPrimary = (kind: GpsExceptionKind) => {
    if (kind === "no_show") return onHeroAction("CONFIRM_ARRIVAL");
    if (kind === "zone_exit") return onHeroAction("STAY_WORKING");
    setDismissedGps(kind);
  };
  const onGpsSecondary = (kind: GpsExceptionKind) => {
    if (kind === "zone_exit") return setModal("EXIT");
    if (kind === "no_show") {
      setDismissedGps(kind);
      return;
    }
    router.push("/system/health");
  };

  return (
    <ScreenScroll
      edges={SAFE_EDGES.tab}
      refreshControl={refreshControl}
      footer={
        <PrimaryButton
          label={t(ui.primary.labelKey)}
          variant={sessionState === "ACTIVA" || sessionState === "SALIDA" ? "danger" : "primary"}
          onPress={() => onHeroAction(ui.primary.action)}
          isLoading={busy}
        />
      }
    >
        <PageHeader title={t("tabs.today")} subtitle={formatDate(nowMs)} helpScreen="today" showHealth />
        <ScreenTips
          screen="today"
          sessionState={sessionState}
          siteCount={sites.length}
          batteryRestricted={healthRaw.batteryOptimization === "restricted"}
          provisionalSeal={false}
          hasSplitRow={false}
          hasZeroOmitted={false}
        />

        {healthRaw.notifications === "denied" || healthRaw.notifications === "blocked" ? (
          <ScreenStatusBanner status="degraded" message={t("notifications.noticesDenied")} />
        ) : null}

        {hasConflict ? (
          <ScreenStatusBanner status="conflict" message={t("today.conflictBanner")} onPress={() => router.push("/system/conflict")} />
        ) : null}

        {active?.bookkeeping.integrityReason === "ORPHAN_SESSION" ? (
          <OrphanReviewCard
            startMs={active.actualStartAtMs ?? active.declaredStartAtMs}
            nowMs={nowMs}
            busy={busy}
            fixedLunchMinutes={active.lunch.startAtMs == null ? active.lunch.deductedMinutes : null}
            onContinue={() => void run({ type: "CONTINUE_ORPHAN" })}
            onConfirm={(endAtMs, note) => void run({ type: "CONFIRM_ORPHAN_END", endAtMs, note })}
          />
        ) : null}

        {!crypto.platformSupported ? <ScreenStatusBanner status="degraded" message={t("fieldCrypto.web")} /> : null}

        {ledger.broken ? (
          <ScreenStatusBanner
            status="conflict"
            message={`${t("health.ledger.brokenTitle")} — ${t("health.ledger.brokenBody")}`}
            onPress={() => router.push("/system/health")}
          />
        ) : null}

        <SystemHealthBlock
          health={health}
          tracking={sessionState !== "NO_INICIADA" && sessionState !== "CERRADA"}
          onPress={() => router.push("/system/health")}
        />

        <LiveShiftPanel
          ui={ui}
          destination={
            target?.alias ??
            (lastToday && sessionState === "CERRADA" ? sessionSiteLabel(lastToday, state.sites.byId) || null : null)
          }
          onDestinationPress={target ? () => router.push(`/sites/${target.id}`) : undefined}
          uncertified={uncertified}
          nextAction={
            sessionState === "ESPERANDO"
              ? `${t("today.nextAction", { site: target?.alias ?? t("today.noDestination") })} · ${t(healthRaw.isMonitoring ? "today.geofenceOn" : "today.geofenceOff")}`
              : null
          }
          busy={busy}
          pinPrimary
          counter={visitedCount > 0 ? String(visitedCount) : null}
          showSummary={sessionState !== "NO_INICIADA" || summary.netMinutes > 0}
          onPrimaryAction={() => onHeroAction(ui.primary.action)}
          onSecondaryAction={ui.secondary ? () => onHeroAction(ui.secondary!.action) : undefined}
        />

        {noSitesNoSession ? (
          <EmptyState
            compact
            title={t("today.emptyHint")}
            icon="location-outline"
            action={{ label: t("cta.createFirstSite"), onPress: () => router.push("/sites/new") }}
          />
        ) : null}

        {gpsKind && gpsKind !== dismissedGps ? (
          <GpsExceptionCard
            kind={gpsKind}
            busy={busy}
            onPrimary={() => onGpsPrimary(gpsKind)}
            onSecondary={() => onGpsSecondary(gpsKind)}
          />
        ) : null}

        {canErrand && active ? (
          <Pressable
            onPress={() => {
              if (active.siteId == null) return;
              void run({ type: "START_TRANSFER", toSiteId: active.siteId, purpose: "ERRAND" });
            }}
            accessibilityRole="button"
            style={styles.footerLink}
          >
            <Text style={[styles.link, { color: colors.text.primary }]}>{t("today.errand")}</Text>
          </Pressable>
        ) : null}

        {canExtend ? (
          <Pressable onPress={() => setModal("EXTEND")} accessibilityRole="button" style={styles.footerLink}>
            <Text style={[styles.link, { color: colors.text.primary }]}>{t("today.keepWorking")}</Text>
          </Pressable>
        ) : null}

        {sessionState === "CERRADA" && lastToday ? (
          <View style={styles.chips}>
            <Pressable onPress={() => void run({ type: "ACK_DAY_SUMMARY", sessionId: lastToday.id })} accessibilityRole="button" style={styles.footerLink}>
              <Text style={[styles.link, { color: colors.text.primary }]}>{t("today.ackDay")}</Text>
            </Pressable>
            <Pressable onPress={() => router.push(`/session/${lastToday.id}`)} accessibilityRole="button" style={styles.footerLink}>
              <Text style={[styles.link, { color: colors.text.primary }]}>{t("today.correctDay")}</Text>
            </Pressable>
          </View>
        ) : null}

        {active && sessionState !== "NO_INICIADA" && sessionState !== "CERRADA" ? (
          <Pressable onPress={() => setModal("NOTE")} accessibilityRole="button" style={styles.footerLink}>
            <Text style={[styles.link, { color: colors.text.primary }]}>{t("today.quickNote")}</Text>
          </Pressable>
        ) : null}

        {visited.length > 1 ? (
          <View style={styles.visited}>
            <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>{t("today.visitedToday")}</Text>
            <View style={styles.chips}>
              {visited.map((s) => (
                <Chip key={s!.id} label={s!.alias} />
              ))}
            </View>
          </View>
        ) : null}

        <Pressable onPress={() => router.push("/sites")} accessibilityRole="link" accessibilityHint={t("a11y.manageSitesHint")} style={styles.footerLink}>
          <Text style={[styles.link, { color: colors.text.primary }]}>{t("cta.manageSites")}</Text>
        </Pressable>

      <DailySetupModal
        visible={modal === "SETUP_START" || modal === "SETUP_TRANSIT"}
        mode={modal === "SETUP_TRANSIT" ? "transit" : "start"}
        sites={sites}
        excludeSiteId={modal === "SETUP_TRANSIT" ? target?.id ?? null : null}
        busy={busy}
        onCancel={() => setModal(null)}
        onConfirm={(siteId) =>
          void run(modal === "SETUP_TRANSIT" ? { type: "START_TRANSFER", toSiteId: siteId } : { type: "START_DAY", siteId }, () => setModal(null))
        }
        onQuickCreate={onQuickCreate}
      />

      <LunchModal
        visible={modal === "LUNCH_CLOSE_DAY" || modal === "LUNCH_CLOSE_EXIT"}
        mode="close"
        busy={busy}
        askStartTime={selectActiveCrossesWorkday(state, nowMs)}
        sessionStartMs={active ? (active.actualStartAtMs ?? active.declaredStartAtMs) : undefined}
        sessionEndMs={
          active?.domainStatus === "SALIDA" && active.bookkeeping.firstExitAtMs ? active.bookkeeping.firstExitAtMs : nowMs
        }
        netMinutes={summary.netMinutes}
        grossEstimate={summary.grossEstimate}
        onCancel={() => setModal(null)}
        onConfirm={(minutes, startHHmm) => {
          // "HH:mm" → primer instante ≥ inicio de la jornada con esa hora de pared (§5.3).
          const [h, m] = (startHHmm ?? "").split(":").map(Number);
          const base = active ? active.actualStartAtMs ?? active.declaredStartAtMs : nowMs;
          const lunchStartAtMs = startHHmm ? wallMinutesOnOrAfter(base, h * 60 + m) : null;
          void run(
            modal === "LUNCH_CLOSE_EXIT"
              ? { type: "CONFIRM_EXIT", lunchDeductedMinutes: minutes, lunchStartAtMs }
              : { type: "CLOSE_DAY", lunchDeductedMinutes: minutes, lunchStartAtMs },
            () => {
              setModal(null);
              showToast(minutes && minutes > 0 ? t("today.lunchDeducted", { minutes }) : t("today.lunchNone"), "info");
            },
          );
        }}
      />

      <LunchModal
        visible={modal === "LUNCH_SUPERVISOR"}
        mode="supervisor"
        busy={busy}
        elapsed={formatDuration(selectLunchElapsedMs(state, nowMs))}
        onCancel={() => setModal(null)}
        onResume={() => void run({ type: "RESUME" }, () => setModal(null))}
        onFinish={() => void run({ type: "CLOSE_DAY" }, () => setModal(null))}
      />

      <ModalShell
        visible={modal === "CANCEL_TRANSFER"}
        title={t("modals.cancelTransferTitle")}
        description={t("modals.cancelTransferBody")}
        onClose={() => setModal(null)}
        showCloseButton={false}
        secondaryAction={{ label: t("common.cancel"), onPress: () => setModal(null) }}
        primaryAction={{
          label: t("cta.cancelTransfer"),
          loading: busy,
          onPress: () => void run({ type: "CANCEL_TRANSFER", note: cancelNote.trim() || null }, () => setModal(null)),
        }}
      >
        <Input label={t("modals.cancelTransferNote")} value={cancelNote} onChangeText={setCancelNote} placeholder={t("modals.cancelTransferPlaceholder")} />
      </ModalShell>

      <AddNoteModal
        visible={modal === "NOTE"}
        title={t("today.quickNote")}
        busy={busy}
        onCancel={() => setModal(null)}
        onSave={(note) => {
          if (!active) return;
          void run({ type: "ADD_NOTE", sessionId: active.id, note }, () => setModal(null));
        }}
      />

      <ConfirmActionModal
        visible={modal === "CANCEL_DAY"}
        title={t("today.cancelDayTitle")}
        description={t("today.cancelDayBody")}
        confirmLabel={t("today.cancelDayConfirm")}
        cancelLabel={t("common.back")}
        busy={busy}
        onCancel={() => setModal(null)}
        onConfirm={() => void run({ type: "CANCEL_DAY" }, () => setModal(null))}
      />

      <ConfirmActionModal
        visible={modal === "EXTEND"}
        title={t("today.extendTitle")}
        description={t("today.extendBody")}
        confirmLabel={t("today.keepWorking")}
        cancelLabel={t("common.back")}
        tone="warning"
        busy={busy}
        onCancel={() => setModal(null)}
        onConfirm={() => void run({ type: "EXTEND_SHIFT" }, () => setModal(null))}
      />

      <ExitDetectionModal
        visible={modal === "EXIT"}
        firstExitTime={formatTime(active?.bookkeeping.firstExitAtMs ?? null)}
        busy={busy}
        onStay={() => void run({ type: "STAY_WORKING" }, () => setModal(null))}
        onLunch={() => void run({ type: "START_LUNCH" }, () => setModal(null))}
        onTransfer={() => setModal("SETUP_TRANSIT")}
        onErrand={() => {
          if (!active || active.siteId == null) return;
          void run({ type: "START_TRANSFER", toSiteId: active.siteId, purpose: "ERRAND" }, () => setModal(null));
        }}
        onCloseDay={() => setModal("LUNCH_CLOSE_EXIT")}
        onDismiss={() => setModal(null)}
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  visited: { gap: TOKENS.spacing.sm },
  sectionLabel: { ...FONT.label },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm },
  footerLink: { alignSelf: "center", padding: TOKENS.spacing.md, minHeight: TOKENS.layout.minTouchTarget, justifyContent: "center" },
  link: { ...FONT.bodyStrong },
});
