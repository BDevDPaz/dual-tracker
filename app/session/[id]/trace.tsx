/**
 * session/[id]/trace.tsx — Rastro (Producto §5.10).
 * Plano local (sin teselas, sin enviar coordenadas) y lista de puntos.
 * Capas Perímetro / Miga de pan. Precisión visible por punto. Solo lee.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Chip, NotFoundState, SAFE_EDGES, ScreenContainer } from "../../../src/components/ui";
import { AlertCenter } from "../../../src/components/ui/AlertCenter";
import { KeyValueRow, ScreenStatusBanner } from "../../../src/components/blocks";
import { TracePlane, type TraceSiteMark } from "../../../src/components/trace/TracePlane";
import { TOKENS, FONT, ICON } from "../../../src/constants/theme";
import { useTheme } from "../../../src/context/ThemeContext";
import type { SpatialFact } from "../../../src/core/contracts";
import { useAutoRefresh, usePullToRefresh, useQuery, useWorkTracker } from "../../../src/core/hooks";
import { selectIsHydrated, selectSessionById, selectSiteById } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { tSpatialType } from "../../../src/i18n/labels";
import { formatTime } from "../../../src/utils/dateUtils";

type Layer = "PERIMETER" | "BREADCRUMB";

export default function TraceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const sessionId = Number(id);
  const { state, queries } = useWorkTracker();
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ PERIMETER: true, BREADCRUMB: true });
  const session = selectSessionById(state, sessionId);
  const site = selectSiteById(state, session?.siteId ?? null);
  const radius = site?.radiusM ?? state.settings.company.defaultRadiusM;
  const updatedAt = session?.bookkeeping.updatedAtMs ?? 0;
  const facts = useQuery(() => queries.loadTrace(sessionId), [sessionId, updatedAt], ["trace"]);

  const all = useMemo(() => facts.data ?? [], [facts.data]);
  const visible = all.filter((f) => (f.type === "BREADCRUMB" ? layers.BREADCRUMB : layers.PERIMETER));
  const crumbs = all.filter((f) => f.type === "BREADCRUMB");
  const isUnreliable = (f: SpatialFact) => !f.reliable || (f.accuracyM !== null && f.accuracyM > radius);
  const gapKey = `${state.settings.company.traceRetentionDays}:${Object.keys(state.packs.byId).join(",")}`;
  const gaps = useMemo(() => (gapKey && facts.data ? queries.traceGaps(facts.data) : []), [facts.data, queries, gapKey]);
  const siteMarks = useMemo(() => {
    const ids = new Set<number>();
    if (session?.siteId) ids.add(session.siteId);
    for (const f of all) if (typeof f.siteId === "number") ids.add(f.siteId);
    const marks: TraceSiteMark[] = [];
    for (const id of ids) {
      const s = selectSiteById(state, id);
      if (!s || s.targetLat === null || s.targetLon === null) continue;
      if (s.unreadableFields?.includes("coords")) continue;
      marks.push({ id: s.id, lat: s.targetLat, lon: s.targetLon, radiusM: s.radiusM ?? state.settings.company.defaultRadiusM });
    }
    return marks;
  }, [all, session?.siteId, state]);
  const mapFacts = visible.filter((f) => f.lat !== null && f.lon !== null && !f.unreadable);
  const mapGaps = layers.BREADCRUMB ? gaps : [];

  // FieldCrypto §14: coordenadas de una clave perdida → texto de ilegible (nunca ciphertext).
  const unreadable = all.some((f) => f.unreadable);

  if (!selectIsHydrated(state) || (facts.loading && !facts.data)) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }
  if (!session) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <NotFoundState title={t("trace.notFound")} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/history"))} />
      </ScreenContainer>
    );
  }

  // P1: 3 degraded en un solo AlertCenter.
  const traceAlerts: React.ComponentProps<typeof AlertCenter>["alerts"] = [];
  if (unreadable) traceAlerts.push({ key: "unreadable", message: t("fieldCrypto.unreadableTrace"), tone: "warning" });
  if (mapGaps.some((g) => g.kind === "retention")) traceAlerts.push({ key: "retention", message: t("trace.retentionGap"), tone: "warning" });
  if (mapGaps.some((g) => g.kind === "recording")) traceAlerts.push({ key: "recording", message: t("trace.recordingGap"), tone: "warning" });

  return (
    <ScreenContainer edges={SAFE_EDGES.stack}>
      {traceAlerts.length > 0 ? <AlertCenter alerts={traceAlerts} /> : null}
      <Text style={[styles.offline, { color: colors.text.secondary }]}>{t("trace.offline")}</Text>
      {mapFacts.length > 0 || siteMarks.length > 0 ? (
        <TracePlane
          facts={mapFacts}
          sites={siteMarks}
          gaps={mapGaps}
          summary={t("trace.mapSummary", {
            points: mapFacts.length,
            exits: mapFacts.filter((f) => f.type === "EXIT").length,
            distance: crumbs.length > 1 ? Math.round(queries.traceDistanceMeters(crumbs)) : 0,
          })}
        />
      ) : null}
      <View style={styles.layers}>
        {(["PERIMETER", "BREADCRUMB"] as const).map((l) => (
          <Chip
            key={l}
            label={t(l === "PERIMETER" ? "trace.layerPerimeter" : "trace.layerBreadcrumb")}
            selected={layers[l]}
            onPress={() => setLayers((s) => ({ ...s, [l]: !s[l] }))}
          />
        ))}
      </View>
      {crumbs.length > 1 ? (
        <KeyValueRow label={t("trace.distance")} value={`${Math.round(queries.traceDistanceMeters(crumbs))} m`} />
      ) : null}
      <FlatList
        style={styles.list}
        data={visible}
        refreshControl={refreshControl}
        contentContainerStyle={styles.listContent}
        keyExtractor={(f, i) => String(f.id ?? `${f.timestampMs}-${i}`)}
        ListEmptyComponent={<ScreenStatusBanner status="empty" message={t("trace.empty")} emptyDescription={t("trace.emptyBody")} emptyIcon="navigate-circle-outline" />}
        renderItem={({ item }) => {
          const bad = isUnreliable(item);
          const color = bad ? colors.statusText.warning : colors.text.primary;
          const precision = bad ? t("trace.unreliable") : t("trace.reliable");
          return (
            <View style={[styles.row, { borderColor: colors.border }]}>
              <Ionicons name={item.type === "BREADCRUMB" ? "ellipse" : item.type === "ENTER" ? "enter-outline" : item.type === "EXIT" ? "exit-outline" : "alert-circle-outline"} size={ICON.sm} color={color} accessibilityElementsHidden importantForAccessibility="no" />
              <View style={styles.flex}>
                <Text style={[styles.type, { color }]}>
                  {tSpatialType(item.type)} · {formatTime(item.timestampMs)} · {precision}
                </Text>
                <Text style={[styles.meta, { color: colors.text.secondary }]}>
                  {item.lat !== null && item.lon !== null ? `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}` : "—"} · {t("trace.accuracy")}:{" "}
                  {item.accuracyM !== null ? `±${Math.round(item.accuracyM)} m` : "—"}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  offline: { ...FONT.caption, marginBottom: TOKENS.spacing.sm },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  layers: { flexDirection: "row", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md, paddingVertical: TOKENS.spacing.sm, borderBottomWidth: TOKENS.layout.hairline },
  flex: { flex: 1 },
  type: { ...FONT.bodySmall },
  meta: { ...FONT.caption, ...FONT.tabularNums, marginTop: TOKENS.spacing.xxs },
});
