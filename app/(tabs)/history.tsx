/**
 * (tabs)/history.tsx — Historial de sesiones (Producto §5.8). REDISEÑO.
 * Lista auditable (no simulador de corrupción). Rango semanal con flechas,
 * rollup semanal, filtros reales por periodo e integridad y tap →
 * /session/[id]. Sin mutaciones directas; sin swipe-to-delete.
 */
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Chip, PageHeader, SAFE_EDGES, ScreenContainer, SummaryCard, VmacSheet } from "../../src/components/ui";
import { ScreenTips } from "../../src/components/support/ScreenTips";
import { KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useAutoRefresh, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import { resolveWeekCursor } from "../../src/core/refresh/weekCursor";
import {
  formatCents,
  formatHundredths,
  minutesToHundredths,
  selectCalendarHistory,
  selectComputedSessions,
  selectHasConflict,
  selectPeriodSessionRows,
  selectReviewSessions,
  selectVisibleSessions,
  type ComputedSession,
  type PeriodSessionRow,
} from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatRange, formatUiDecimal, getWeekEnd, getWeekStart, shiftWeek } from "../../src/utils/dateUtils";

type Filter = "ALL" | "WEEK" | "MANUAL" | "AUTO" | "CONFLICT";
const FILTERS: Filter[] = ["ALL", "WEEK", "MANUAL", "AUTO", "CONFLICT"];

export default function HistoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [vmac, setVmac] = useState(false);
  const { state } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const calendar = selectCalendarHistory(state);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(nowMs, calendar));
  const [weekPinned, setWeekPinned] = useState(false);
  const [filter, setFilter] = useState<Filter>("WEEK");
  useEffect(() => {
    const next = resolveWeekCursor({ weekStart, nowMs, pinned: weekPinned, history: calendar });
    if (next !== weekStart) setWeekStart(next);
  }, [weekStart, nowMs, weekPinned, calendar]);
  const weekEnd = getWeekEnd(weekStart, calendar);
  const isCurrentWeek = weekStart >= getWeekStart(nowMs, calendar);

  const weekRows = useMemo(
    () => selectPeriodSessionRows(state, weekStart, weekEnd, nowMs),
    [state, nowMs, weekStart, weekEnd],
  );
  const computedById = useMemo(() => {
    const map = new Map(selectComputedSessions(state, nowMs).map((c) => [c.session.id, c]));
    return map;
  }, [state, nowMs]);
  const hoursFor = (minutes: number) => `${formatHundredths(minutesToHundredths(minutes))} ${t("common.hours")}`;
  const hoursById = new Map(weekRows.map((r) => [r.session.id, hoursFor(r.netMinutes ?? 0)]));
  const weekHours = formatHundredths(minutesToHundredths(weekRows.reduce((a, r) => a + (r.netMinutes ?? 0), 0)));
  const weekGrossCents = weekRows.reduce((a, r) => a + (r.grossCents ?? 0), 0);
  const counts = { VALID: 0, MANUAL: 0, AUTO: 0, CONFLICT: 0 };
  weekRows.forEach((r) => {
    counts[r.session.integrityClass] += 1;
  });

  // Interpretación: "Todo" = historial completo; el resto se acota a la semana seleccionada.
  type HistoryRow = { key: string; item: ComputedSession; slice?: PeriodSessionRow; hoursText?: string };
  const items: HistoryRow[] =
    filter === "ALL"
      ? selectComputedSessions(state, nowMs, selectVisibleSessions(state)).map((item) => ({
          key: String(item.session.id),
          item,
        }))
      : (filter === "WEEK" ? weekRows : weekRows.filter((c) => c.session.integrityClass === filter)).flatMap((slice) => {
          const item = computedById.get(slice.session.id);
          if (!item) return [];
          return [{ key: String(slice.session.id), item, slice, hoursText: hoursById.get(slice.session.id) }];
        });

  return (
    <ScreenContainer edges={SAFE_EDGES.tab}>
      <PageHeader title={t("history.title")} helpScreen="history" showHealth />
      <ScreenTips
        screen="history"
        sessionState={null}
        siteCount={0}
        batteryRestricted={false}
        provisionalSeal={false}
        hasSplitRow={weekRows.some((r) => r.continuesFromMs != null || r.continuesUntilMs != null)}
        hasZeroOmitted={weekRows.some((r) => r.zeroDuration)}
      />
      <View style={styles.weekRow}>
        <Pressable
          onPress={() => {
            setWeekPinned(true);
            setWeekStart((w) => shiftWeek(w, -1, calendar));
          }}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.prevWeek")}
          style={styles.weekHit}
        >
          <Ionicons name="chevron-back" size={ICON.xl} color={colors.text.primary} />
        </Pressable>
        <Text style={[styles.weekText, { color: colors.text.primary }]}>{formatRange(weekStart, weekEnd)}</Text>
        <Pressable
          disabled={isCurrentWeek}
          onPress={() => {
            const next = shiftWeek(weekStart, 1, calendar);
            const current = getWeekStart(nowMs, calendar);
            if (next >= current) {
              setWeekPinned(false);
              setWeekStart(current);
            } else {
              setWeekPinned(true);
              setWeekStart(next);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.nextWeek")}
          accessibilityState={{ disabled: isCurrentWeek }}
          style={styles.weekHit}
        >
          <Ionicons name="chevron-forward" size={ICON.xl} color={isCurrentWeek ? colors.text.muted : colors.text.primary} />
        </Pressable>
      </View>

      {selectHasConflict(state) ? (
        <ScreenStatusBanner status="conflict" message={t("screen.conflict")} onPress={() => router.push("/system/conflict")} />
      ) : null}
      {selectReviewSessions(state).some((s) => s.bookkeeping.integrityReason === "ORPHAN_SESSION") ? (
        <ScreenStatusBanner
          status="conflict"
          message={t("today.orphanTitle")}
          onPress={() => {
            const orphan = selectReviewSessions(state).find((s) => s.bookkeeping.integrityReason === "ORPHAN_SESSION");
            if (orphan) router.push(`/session/${orphan.id}`);
          }}
        />
      ) : null}

      <SummaryCard
        hoursLabel={t("today.netHours")}
        hours={`${formatUiDecimal(weekHours)} ${t("common.hours")}`}
        moneyLabel={t("today.estimate")}
        money={formatCents(weekGrossCents)}
      />
      <Card style={styles.rollup}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>{t("history.weeklyRollup")}</Text>
        <KeyValueRow label={t("history.manualCount")} value={String(counts.MANUAL)} />
        <KeyValueRow label={t("history.conflictCount")} value={String(counts.CONFLICT)} />
      </Card>

      <View>
        <Pressable onPress={() => setVmac(true)} accessibilityRole="button" accessibilityLabel={t("vmac.open")} style={styles.vmac}>
          <Text style={[styles.vmacText, { color: colors.text.secondary }]}>{t("vmac.mark")}</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => (
            <Chip key={f} label={t(`history.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        style={styles.listFlex}
        data={items}
        keyExtractor={(c) => c.key}
        renderItem={({ item }) => (
          <SessionListItem item={item.item} slice={item.slice} hoursText={item.hoursText} onPress={() => router.push(`/session/${item.item.session.id}`)} />
        )}
        ListEmptyComponent={<ScreenStatusBanner status="empty" message={t("history.empty")} emptyDescription={t("history.emptyBody")} emptyIcon="calendar-outline" />}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl}
      />
      <VmacSheet visible={vmac} onClose={() => setVmac(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  weekHit: { minWidth: TOKENS.layout.minTouchTarget, minHeight: TOKENS.layout.minTouchTarget, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: TOKENS.spacing.md },
  weekText: { ...FONT.bodyStrong, flex: 1, textAlign: "center" },
  rollup: { padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.md },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.sm },
  filters: { gap: TOKENS.spacing.sm, paddingBottom: TOKENS.spacing.md },
  vmac: { minHeight: TOKENS.layout.minTouchTarget, justifyContent: "center" },
  vmacText: { ...FONT.label },
  listFlex: { flex: 1 },
  list: { paddingBottom: TOKENS.spacing["3xl"], flexGrow: 1 },
});
