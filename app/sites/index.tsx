import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useRouter, Stack } from "expo-router";

import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useLanguage } from "../../src/context/LanguageContext";
import {
  ScreenContainer,
  PageHeader,
  Card,
  Input,
  StatusPill,
  EmptyState,
  LoadingOverlay,
  Button,
} from "../../src/components/ui";
import { useSiteRegistry } from "../../src/core/hooks/dualTracker";
import type { Site } from "../../src/core/contracts/domain";

function SiteRow({ site, onPress }: { site: Site; onPress: () => void }) {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.siteCard}>
        <View style={styles.siteHeaderRow}>
          <Text style={styles.siteAlias}>{site.alias}</Text>
          <StatusPill
            status={site.isActive ? "info" : "pending"}
            label={site.isActive ? t("sites_active") : t("sites_archived")}
          />
        </View>
        {site.clientName ? <Text style={styles.siteClient}>{site.clientName}</Text> : null}
        <Text style={styles.siteMeta}>
          {site.address || t("sites_no_address")} · {site.radiusMeters}m
        </Text>
      </Card>
    </Pressable>
  );
}

export default function SitesIndexScreen() {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");

  // Si showArchived=true, se listan también los archivados (activeOnly=false);
  // si es false, solo los activos (activeOnly=true). El hook reconsulta el
  // catálogo porque `activeOnly` es parte de su dependencia interna.
  const { loading, error, sites, refresh } = useSiteRegistry(!showArchived);

  const filteredSites = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return sites;
    return sites.filter((site) => {
      const alias = site.alias.toLowerCase();
      const client = (site.clientName ?? "").toLowerCase();
      return alias.includes(normalized) || client.includes(normalized);
    });
  }, [sites, query]);

  return (
    <ScreenContainer noPadding>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader
        title={t("sites_title")}
        showBack
        rightAction={{
          icon: "add-circle-outline",
          onPress: () => router.push("/sites/new"),
          accessibilityLabel: t("sites_new_accessibility"),
        }}
      />

      <View style={styles.searchWrapper}>
        <Input
          placeholder={t("sites_search_placeholder")}
          value={query}
          onChangeText={setQuery}
          icon="search-outline"
        />
        <Button
          label={showArchived ? t("sites_show_active") : t("sites_show_archived")}
          variant="ghost"
          size="sm"
          onPress={() => setShowArchived((prev) => !prev)}
          style={styles.toggleArchivedButton}
        />
      </View>

      {loading ? <LoadingOverlay visible message={t("sites_loading")} /> : null}

      {!loading && error ? (
        <EmptyState
          title={t("sites_load_error")}
          description={error}
          icon="alert-circle-outline"
        />
      ) : null}

      {!loading && !error && filteredSites.length === 0 ? (
        <EmptyState
          title={t("sites_empty")}
          description={t("sites_empty_desc")}
          icon="location-outline"
        />
      ) : null}

      {!loading && !error && filteredSites.length > 0 ? (
        <FlatList
          data={filteredSites}
          keyExtractor={(site) => site.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SiteRow site={item} onPress={() => router.push(`/sites/${item.id}`)} />
          )}
          onRefresh={refresh}
          refreshing={loading}
        />
      ) : null}
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  searchWrapper: {
    paddingHorizontal: tokens.layout.screenPadding,
  },
  toggleArchivedButton: {
    alignSelf: "flex-start",
    marginTop: -tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  listContent: {
    paddingHorizontal: tokens.layout.screenPadding,
    paddingBottom: tokens.spacing["4xl"],
  },
  siteCard: { marginBottom: tokens.spacing.md },
  siteHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  siteAlias: { ...FONT.bodyStrong, color: tokens.colors.text.primary },
  siteClient: { ...FONT.caption, color: tokens.colors.text.secondary, marginTop: 2 },
  siteMeta: { ...FONT.caption, color: tokens.colors.text.muted, marginTop: tokens.spacing.xs },
  });
}
