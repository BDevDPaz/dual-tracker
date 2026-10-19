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
  DailySummaryBlock,
  OperationalHeroCard,
  PageHeader,
  SAFE_EDGES,
  ScreenScroll,
  SystemHealthBlock,
  EmptyState,
} from "../../src/components/ui";
import { DailySetupModal, ExitDetectionModal, LunchModal } from "../../src/components/modals";
import { ScreenStatusBanner } from "../../src/components/blocks";
import { ScreenTips } from "../../src/components/support/ScreenTips";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { SiteDraft, ViewIntent } from "../../src/core/contracts";
import { useAutoRefresh, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import {
  getSessionStateUI,
  selectActiveElapsedMs,
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
import { formatCurrency, formatDate, formatDuration, formatTime, wallMinutesOnOrAfter } from "../../src/utils/dateUtils";

type OpenModal = null | "SETUP_START" | "SETUP_TRANSIT" | "LUNCH_CLOSE_DAY" | "LUNCH_CLOSE_EXIT" | "LUNCH_SUPERVISOR" | "EXIT";

export default function TodayScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const nowMs = useClock(1000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [modal, setModal] = useState<OpenModal>(null);
  const [busy, setBusy] = useState(false);

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
    else return;
    void emit({ type: "CONSUME_UI_REQUEST" });
  }, [uiRequests.openExitModal, uiRequests.openDailySetup, emit]);

  // Si el estado deja de ser SALIDA (p. ej. decidido desde la notificación), cerrar el hub.
  useEffect(() => {
    if (modal === "EXIT" && sessionState !== "SALIDA") setModal(null);
  }, [modal, sessionState]);

  const run = async (intent: ViewIntent, after?: () => void) => {
    setBusy(true);
    const res = await emit(intent);
    setBusy(false);
    if (res.ok) after?.();
    return res;
  };

  const onHeroAction = (action: HeroAction) => {
    switch (action) {
      case "OPEN_DAILY_SETUP_START":
      case "NEW_DAY":
        return setModal("SETUP_START");
      case "CANCEL_DAY":
        return void run({ type: "CANCEL_DAY" });
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
        return void run({ type: "CANCEL_TRANSFER" });
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
    const res = await emit({ type: "UPSERT_SITE", site: draft });
    return res.ok ? ((res.data as import("../../src/core/contracts").Site) ?? null) : null;
  };

  const noSitesNoSession = sites.length === 0 && !active;
  const visited = summary.visitedSiteIds.map((id) => selectSiteById(state, id)).filter((x) => !!x);
  const uncertified = health.degraded || (!!active && active.integrityClass !== "VALID") || !summary.certified;

  return (
    <ScreenScroll edges={SAFE_EDGES.tab} refreshControl={refreshControl}>
        <PageHeader
          title={t("app.name")}
          subtitle={formatDate(nowMs)}
          helpScreen="today"
          rightAction={{ icon: "pulse-outline", onPress: () => router.push("/system/health"), accessibilityLabel: t("health.title") }}
        />
        <ScreenTips
          screen="today"
          sessionState={sessionState}
          siteCount={sites.length}
          batteryRestricted={healthRaw.batteryOptimization === "restricted"}
          provisionalSeal={false}
          hasSplitRow={false}
          hasZeroOmitted={false}
        />

        {hasConflict ? (
          <ScreenStatusBanner status="conflict" message={t("today.conflictBanner")} onPress={() => router.push("/system/conflict")} />
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

        <OperationalHeroCard
          ui={ui}
          destination={
            target?.alias ??
            (lastToday && sessionState === "CERRADA" ? sessionSiteLabel(lastToday, state.sites.byId) || null : null)
          }
          onDestinationPress={target ? () => router.push(`/sites/${target.id}`) : undefined}
          timeString={formatDuration(selectActiveElapsedMs(state, nowMs))}
          earnings={formatCurrency(summary.grossEstimate)}
          uncertified={uncertified}
          nextAction={
            sessionState === "ESPERANDO"
              ? `${t("today.nextAction", { site: target?.alias ?? t("today.noDestination") })} · ${t(healthRaw.isMonitoring ? "today.geofenceOn" : "today.geofenceOff")}`
              : null
          }
          busy={busy}
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

        {/* Resumen del día solo con la jornada cerrada: nunca junto al temporizador del hero. */}
        {sessionState === "CERRADA" ? (
          <DailySummaryBlock hours={`${(summary.netMinutes / 60).toFixed(2)} ${t("common.hours")}`} earnings={formatCurrency(summary.grossEstimate)} />
        ) : null}

        {visited.length > 1 ? (
          <View style={styles.visited}>
            <Text style={[styles.sectionLabel, { color: TOKENS.colors.text.secondary }]}>{t("today.visitedToday")}</Text>
            <View style={styles.chips}>
              {visited.map((s) => (
                <Chip key={s!.id} label={s!.alias} />
              ))}
            </View>
          </View>
        ) : null}

        <Pressable onPress={() => router.push("/sites")} accessibilityRole="link" style={styles.footerLink}>
          <Text style={[styles.link, { color: TOKENS.colors.primary }]}>{t("cta.manageSites")}</Text>
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
        askStartTime={selectActiveCrossesWorkday(state, nowMs)}
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
            () => setModal(null),
          );
        }}
      />

      <LunchModal
        visible={modal === "LUNCH_SUPERVISOR"}
        mode="supervisor"
        elapsed={formatDuration(selectLunchElapsedMs(state, nowMs))}
        onCancel={() => setModal(null)}
        onResume={() => void run({ type: "RESUME" }, () => setModal(null))}
        onFinish={() => void run({ type: "CLOSE_DAY" }, () => setModal(null))}
      />

      <ExitDetectionModal
        visible={modal === "EXIT"}
        firstExitTime={formatTime(active?.bookkeeping.firstExitAtMs ?? null)}
        busy={busy}
        onStay={() => void run({ type: "STAY_WORKING" }, () => setModal(null))}
        onLunch={() => void run({ type: "START_LUNCH" }, () => setModal(null))}
        onTransfer={() => setModal("SETUP_TRANSIT")}
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
