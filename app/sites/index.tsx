/**
 * sites/index.tsx — Catálogo de sitios (Producto §5.11). NUEVO.
 * Búsqueda, lista de sitios activos (alias, cliente, radio, última visita) y
 * CTA Nuevo destino. Lee SiteRegistry vía selectores.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, EmptyState, Input, SAFE_EDGES, ScreenContainer } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useAutoRefresh, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import { selectIsHydrated, selectSiteLastVisitAtMs, selectSites } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDate } from "../../src/utils/dateUtils";

export default function SitesIndexScreen() {
  const router = useRouter();
  const { state } = useWorkTracker();
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const [q, setQ] = useState("");
  const searchChain = useFormFocusChain(FORM_FIELDS.siteSearch, { onSubmit: () => undefined, canSubmit: false });
  const sites = selectSites(state);
  const radiusDefault = state.settings.company.defaultRadiusM;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sites;
    return sites.filter((x) => [x.alias, x.address, x.clientName ?? ""].some((v) => v.toLowerCase().includes(s)));
  }, [q, sites]);

  if (!selectIsHydrated(state)) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }

  if (sites.length === 0) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScrollView contentContainerStyle={styles.empty} refreshControl={refreshControl}>
          <EmptyState
            title={t("sites.empty")}
            description={t("sites.emptyBody")}
            icon="location-outline"
            action={{ label: t("cta.createFirstSite"), onPress: () => router.push("/sites/new") }}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={SAFE_EDGES.stack}>
      <Input {...searchChain.props("search")} placeholder={t("sites.search")} value={q} onChangeText={setQ} icon="search-outline" />
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.list}
        data={filtered}
        keyExtractor={(s) => String(s.id)}
        refreshControl={refreshControl}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<ScreenStatusBanner status="empty" message={t("sites.noResults", { query: q.trim() })} emptyIcon="location-outline" />}
        renderItem={({ item }) => {
          const lastVisit = selectSiteLastVisitAtMs(state, item.id);
          const alias = item.unreadableFields?.includes("alias") && !item.alias ? t("fieldCrypto.unreadableSite") : item.alias;
          const visit = lastVisit ? formatDate(lastVisit) : t("sites.never");
          const meta = `${item.clientName ? `${item.clientName} · ` : ""}${item.radiusM ?? radiusDefault} m`;
          return (
          <Pressable
            onPress={() => router.push(`/sites/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${alias}. ${meta}. ${t("sites.lastVisit")}: ${visit}`}
            accessibilityHint={t("a11y.linkHint")}
            style={[styles.row, { borderColor: TOKENS.colors.border }]}
          >
            <View style={styles.flex}>
              <Text style={[styles.alias, { color: TOKENS.colors.text.primary }]}>{alias}</Text>
              <Text style={[styles.meta, { color: TOKENS.colors.text.secondary }]}>{meta}</Text>
              <Text style={[styles.meta, { color: TOKENS.colors.text.muted }]}>
                {t("sites.lastVisit")}: {visit}
              </Text>
              {item.targetLat === null ? <Text style={[styles.meta, { color: TOKENS.colors.status.warning }]}>{t("sites.coordsMissing")}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={ICON.md} color={TOKENS.colors.text.muted} accessibilityElementsHidden importantForAccessibility="no" />
          </Pressable>
          );
        }}
      />
      <Button label={t("sites.newSite")} iconName="add" onPress={() => router.push("/sites/new")} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { flexGrow: 1 },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", minHeight: TOKENS.layout.minTouchTarget, paddingVertical: TOKENS.spacing.md, borderBottomWidth: TOKENS.layout.hairline, gap: TOKENS.spacing.md },
  flex: { flex: 1 },
  alias: { ...FONT.bodyStrong },
  meta: { ...FONT.caption, marginTop: TOKENS.spacing.xxs },
});
