/**
 * sites/index.tsx — Catálogo de sitios (Producto §5.11). NUEVO.
 * Búsqueda, lista de sitios activos (alias, cliente, radio, última visita) y
 * CTA Nuevo destino. Lee SiteRegistry vía selectores.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, EmptyState, Input, ScreenContainer } from "../../src/components/ui";
import { ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { selectIsHydrated, selectSites } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDate } from "../../src/utils/dateUtils";

export default function SitesIndexScreen() {
  const router = useRouter();
  const { state } = useWorkTracker();
  const [q, setQ] = useState("");
  const sites = selectSites(state);
  const radiusDefault = state.settings.company.defaultRadiusM;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sites;
    return sites.filter((x) => [x.alias, x.address, x.clientName ?? ""].some((v) => v.toLowerCase().includes(s)));
  }, [q, sites]);

  if (!selectIsHydrated(state)) return <ScreenStatusBanner status="loading" message={t("common.loading")} />;

  if (sites.length === 0) {
    return (
      <ScreenContainer>
        <EmptyState
          title={t("sites.empty")}
          description={t("today.emptyHint")}
          icon="location-outline"
          action={{ label: t("cta.createFirstSite"), onPress: () => router.push("/sites/new") }}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Input placeholder={t("sites.search")} value={q} onChangeText={setQ} icon="search-outline" />
      <FlatList
        data={filtered}
        keyExtractor={(s) => String(s.id)}
        ListEmptyComponent={<ScreenStatusBanner status="empty" message={t("sites.empty")} emptyIcon="location-outline" />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/sites/${item.id}`)} accessibilityRole="button" style={[styles.row, { borderColor: TOKENS.colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.alias, { color: TOKENS.colors.text.primary }]}>{item.unreadableFields?.includes("alias") && !item.alias ? t("fieldCrypto.unreadableSite") : item.alias}</Text>
              <Text style={[styles.meta, { color: TOKENS.colors.text.secondary }]} numberOfLines={1}>
                {item.clientName ? `${item.clientName} · ` : ""}
                {item.radiusM ?? radiusDefault} m
              </Text>
              <Text style={[styles.meta, { color: TOKENS.colors.text.muted }]}>
                {t("sites.lastVisit")}: {item.lastVisitAtMs ? formatDate(item.lastVisitAtMs) : t("sites.never")}
              </Text>
              {item.targetLat === null ? <Text style={[styles.meta, { color: TOKENS.colors.status.warning }]}>{t("sites.coordsMissing")}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={TOKENS.colors.text.muted} />
          </Pressable>
        )}
      />
      <Button label={t("sites.newSite")} iconName="add" onPress={() => router.push("/sites/new")} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: TOKENS.spacing.md, borderBottomWidth: 1, gap: TOKENS.spacing.md },
  flex: { flex: 1 },
  alias: { ...FONT.bodyStrong },
  meta: { ...FONT.caption, marginTop: 2 },
});
