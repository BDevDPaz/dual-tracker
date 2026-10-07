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
import { Card, PageHeader, ScreenContainer } from "../../src/components/ui";
import { KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useAutoRefresh, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import { resolveWeekCursor } from "../../src/core/refresh/weekCursor";
import { selectCalendarHistory, selectComputedSessions, selectHasConflict, selectRollup, selectSessionsInRange, selectVisibleSessions } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatCurrency, formatRange, getWeekEnd, getWeekStart, shiftWeek } from "../../src/utils/dateUtils";

type Filter = "ALL" | "WEEK" | "MANUAL" | "AUTO" | "CONFLICT";
const FILTERS: Filter[] = ["ALL", "WEEK", "MANUAL", "AUTO", "CONFLICT"];

export default function HistoryScreen() {
  const router = useRouter();
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

  const weekItems = useMemo(
    () => selectComputedSessions(state, nowMs, selectSessionsInRange(state, weekStart, weekEnd)),
    [state, nowMs, weekStart, weekEnd],
  );
  const rollup = selectRollup(weekItems);

  // Interpretación: "Todo" = historial completo; el resto se acota a la semana seleccionada.
  const items = useMemo(() => {
    if (filter === "ALL") return selectComputedSessions(state, nowMs, selectVisibleSessions(state));
    if (filter === "WEEK") return weekItems;
    return weekItems.filter((c) => c.session.integrityClass === filter);
  }, [filter, state, nowMs, weekItems]);

  return (
    <ScreenContainer>
      <PageHeader title={t("history.title")} />
      <View style={styles.weekRow}>
        <Pressable
          onPress={() => {
            setWeekPinned(true);
            setWeekStart((w) => shiftWeek(w, -1, calendar));
          }}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.prevWeek")}
        >
          <Ionicons name="chevron-back" size={22} color={TOKENS.colors.primary} />
        </Pressable>
        <Text style={[styles.weekText, { color: TOKENS.colors.text.primary }]}>{formatRange(weekStart, weekEnd)}</Text>
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
        >
          <Ionicons name="chevron-forward" size={22} color={isCurrentWeek ? TOKENS.colors.text.muted : TOKENS.colors.primary} />
        </Pressable>
      </View>

      {selectHasConflict(state) ? (
        <ScreenStatusBanner status="conflict" message={t("screen.conflict")} onPress={() => router.push("/system/conflict")} />
      ) : null}

      <Card style={styles.rollup}>
        <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("history.weeklyRollup")}</Text>
        <KeyValueRow label={t("today.netHours")} value={`${(rollup.netMinutes / 60).toFixed(2)} ${t("common.hours")}`} />
        <KeyValueRow label={t("today.estimate")} value={formatCurrency(rollup.grossEstimate)} emphasis />
        <KeyValueRow label={t("history.manualCount")} value={String(rollup.byClass.MANUAL)} />
        <KeyValueRow label={t("history.conflictCount")} value={String(rollup.byClass.CONFLICT)} />
      </Card>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === f }}
              style={[styles.chip, { borderColor: filter === f ? TOKENS.colors.primary : TOKENS.colors.border }]}
            >
              <Text style={{ color: filter === f ? TOKENS.colors.primary : TOKENS.colors.text.secondary }}>{t(`history.filters.${f}`)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        style={styles.listFlex}
        data={items}
        keyExtractor={(c) => String(c.session.id)}
        renderItem={({ item }) => <SessionListItem item={item} onPress={() => router.push(`/session/${item.session.id}`)} />}
        ListEmptyComponent={<ScreenStatusBanner status="empty" message={t("history.empty")} emptyIcon="calendar-outline" />}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: TOKENS.spacing.md },
  weekText: { ...FONT.bodyStrong },
  rollup: { padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.md },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.sm },
  filters: { gap: TOKENS.spacing.sm, paddingBottom: TOKENS.spacing.md },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: TOKENS.spacing.md },
  listFlex: { flex: 1 },
  list: { paddingBottom: TOKENS.spacing["3xl"], flexGrow: 1 },
});
