import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useRouter, Stack } from "expo-router";

import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
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
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.siteCard}>
        <View style={styles.siteHeaderRow}>
          <Text style={styles.siteAlias}>{site.alias}</Text>
          <StatusPill
            status={site.isActive ? "info" : "pending"}
            label={site.isActive ? "Activo" : "Archivado"}
          />
        </View>
        {site.clientName ? <Text style={styles.siteClient}>{site.clientName}</Text> : null}
        <Text style={styles.siteMeta}>
          {site.address || "Sin dirección"} · {site.radiusMeters}m
        </Text>
      </Card>
    </Pressable>
  );
}

export default function SitesIndexScreen() {
  const { tokens } = useTheme();
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
        title="Destinos"
        showBack
        rightAction={{
          icon: "add-circle-outline",
          onPress: () => router.push("/sites/new"),
          accessibilityLabel: "Nuevo destino",
        }}
      />

      <View style={styles.searchWrapper}>
        <Input
          placeholder="Buscar por alias o cliente…"
          value={query}
          onChangeText={setQuery}
          icon="search-outline"
        />
        <Button
          label={showArchived ? "Mostrar activos" : "Mostrar archivados"}
          variant="ghost"
          size="sm"
          onPress={() => setShowArchived((prev) => !prev)}
          style={styles.toggleArchivedButton}
        />
      </View>

      {loading ? <LoadingOverlay visible message="Cargando destinos…" /> : null}

      {!loading && error ? (
        <EmptyState
          title="No se pudieron cargar los destinos"
          description={error}
          icon="alert-circle-outline"
        />
      ) : null}

      {!loading && !error && filteredSites.length === 0 ? (
        <EmptyState
          title="Aún no hay destinos"
          description="Crea el primer destino para reutilizarlo en tus jornadas."
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
