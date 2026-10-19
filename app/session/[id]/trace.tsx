/**
 * session/[id]/trace.tsx — Rastro (Producto §5.10). NUEVO.
 * Lista de puntos de TraceRecorder + hechos ENTER/EXIT de una sesión. Capas
 * Perímetro / Miga de pan. Precisión visible por punto; si accuracy > radio
 * (o el hecho vino marcado no fiable) se pinta como "No fiable". Solo lee:
 * no hay botón de grabar.
 * TODO(propuesta): vista de mapa (react-native-maps no está en las
 * dependencias de los linajes); hoy se presenta como lista.
 */
import { useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Chip, SAFE_EDGES, ScreenContainer } from "../../../src/components/ui";
import { KeyValueRow, ScreenStatusBanner } from "../../../src/components/blocks";
import { TOKENS, FONT, ICON } from "../../../src/constants/theme";
import type { SpatialFact } from "../../../src/core/contracts";
import { useAutoRefresh, usePullToRefresh, useQuery, useWorkTracker } from "../../../src/core/hooks";
import { selectSessionById, selectSiteById } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { formatTime } from "../../../src/utils/dateUtils";

type Layer = "PERIMETER" | "BREADCRUMB";

export default function TraceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const all = facts.data ?? [];
  const visible = all.filter((f) => (f.type === "BREADCRUMB" ? layers.BREADCRUMB : layers.PERIMETER));
  const crumbs = all.filter((f) => f.type === "BREADCRUMB");
  const isUnreliable = (f: SpatialFact) => !f.reliable || (f.accuracyM !== null && f.accuracyM > radius);

  // FieldCrypto §14: coordenadas de una clave perdida → texto de ilegible (nunca ciphertext).
  const unreadable = all.some((f) => f.unreadable);

  if (facts.loading && !facts.data) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={SAFE_EDGES.stack}>
      {unreadable ? <ScreenStatusBanner status="degraded" message={t("fieldCrypto.unreadableTrace")} /> : null}
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
        ListEmptyComponent={<ScreenStatusBanner status="empty" message={t("trace.empty")} emptyIcon="navigate-circle-outline" />}
        renderItem={({ item }) => {
          const bad = isUnreliable(item);
          const color = bad ? TOKENS.colors.status.warning : TOKENS.colors.text.primary;
          return (
            <View style={[styles.row, { borderColor: TOKENS.colors.border }]}>
              <Ionicons name={item.type === "BREADCRUMB" ? "ellipse" : item.type === "ENTER" ? "enter-outline" : item.type === "EXIT" ? "exit-outline" : "alert-circle-outline"} size={ICON.sm} color={color} />
              <View style={styles.flex}>
                <Text style={[styles.type, { color }]}>
                  {item.type} · {formatTime(item.timestampMs)}
                  {bad ? ` · ${t("trace.unreliable")}` : ""}
                </Text>
                <Text style={[styles.meta, { color: TOKENS.colors.text.secondary }]}>
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
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  layers: { flexDirection: "row", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md, paddingVertical: TOKENS.spacing.sm, borderBottomWidth: TOKENS.layout.hairline },
  flex: { flex: 1 },
  type: { ...FONT.bodySmall },
  meta: { ...FONT.caption, ...FONT.tabularNums, marginTop: TOKENS.spacing.xxs },
});
