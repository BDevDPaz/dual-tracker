import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import dayjs from "../../../src/utils/dayjsSetup";
import { FONT, type AppTokens } from "../../../src/constants/theme";
import { useTheme } from "../../../src/context/ThemeContext";
import { useLanguage } from "../../../src/context/LanguageContext";
import type { translations } from "../../../src/utils/i18n";
import {
  ScreenContainer,
  PageHeader,
  Card,
  Button,
  EmptyState,
  LoadingOverlay,
} from "../../../src/components/ui";
import { useSessionTrace } from "../../../src/core/hooks/dualTracker";
import type { SpatialFact, SpatialFactType } from "../../../src/core/contracts/domain";

type Layer = "PERIMETRO" | "BREADCRUMB";

/** Icono por tipo de hecho espacial (ENTER/EXIT/DWELL/BREADCRUMB/ACCURACY_DROP/PROVIDER_LOSS). */
function iconForFactType(type: SpatialFactType): React.ComponentProps<typeof Ionicons>["name"] {
  switch (type) {
    case "ENTER":
      return "log-in-outline";
    case "EXIT":
      return "log-out-outline";
    case "DWELL":
      return "pause-circle-outline";
    case "BREADCRUMB":
      return "footsteps-outline";
    case "ACCURACY_DROP":
      return "warning-outline";
    case "PROVIDER_LOSS":
      return "cloud-offline-outline";
    default:
      return "location-outline";
  }
}

type TF = (key: keyof typeof translations.es, vars?: Record<string, string | number>) => string;

function factTypeLabel(t: TF, type: SpatialFactType): string {
  switch (type) {
    case "ENTER":
      return t("trace_fact_enter");
    case "EXIT":
      return t("trace_fact_exit");
    case "DWELL":
      return t("trace_fact_dwell");
    case "BREADCRUMB":
      return t("trace_fact_breadcrumb");
    case "ACCURACY_DROP":
      return t("trace_fact_accuracy");
    case "PROVIDER_LOSS":
      return t("trace_fact_provider");
    default:
      return type;
  }
}

function FactRow({ fact }: { fact: SpatialFact }) {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const unreliable = !fact.reliable;
  return (
    <Card
      variant={unreliable ? "outline" : "elevated"}
      style={[styles.factCard, unreliable ? styles.unreliableCard : null]}
    >
      <View style={styles.factRow}>
        <Ionicons
          name={iconForFactType(fact.type)}
          size={22}
          color={unreliable ? tokens.colors.status.warning : tokens.colors.text.primary}
          style={styles.factIcon}
        />
        <View style={styles.factContent}>
          <View style={styles.factTitleRow}>
            <Text style={styles.factTitle}>{factTypeLabel(t, fact.type)}</Text>
            {unreliable ? <Text style={styles.unreliableTag}>{t("trace_unreliable")}</Text> : null}
          </View>
          <Text style={styles.factCoords}>
            {fact.lat.toFixed(5)}, {fact.lon.toFixed(5)} · ±{Math.round(fact.accuracyM)}m
          </Text>
          <Text style={styles.factTime}>{dayjs(fact.timestampMs).format("DD MMM, HH:mm:ss")}</Text>
        </View>
      </View>
    </Card>
  );
}

export default function SessionTraceScreen() {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sessionId = id ? Number(id) : NaN;
  const validId = Number.isFinite(sessionId) ? sessionId : null;

  const { loading, error, perimeterFacts, breadcrumbFacts } = useSessionTrace(validId);
  const [layer, setLayer] = useState<Layer>("PERIMETRO");

  const facts = useMemo(
    () => (layer === "PERIMETRO" ? perimeterFacts : breadcrumbFacts),
    [layer, perimeterFacts, breadcrumbFacts],
  );

  const totalFacts = perimeterFacts.length + breadcrumbFacts.length;

  return (
    <ScreenContainer noPadding>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader title={t("trace_title")} showBack onBack={() => router.back()} />

      {loading ? <LoadingOverlay visible message={t("trace_loading")} /> : null}

      {!loading && error ? (
        <EmptyState
          title={t("trace_load_error")}
          description={error}
          icon="alert-circle-outline"
        />
      ) : null}

      {!loading && !error && totalFacts === 0 ? (
        <EmptyState title={t("trace_geofence_only")} icon="location-outline" />
      ) : null}

      {!loading && !error && totalFacts > 0 ? (
        <>
          <View style={styles.toggleRow}>
            <Button
              label={t("trace_layer_perimeter")}
              variant={layer === "PERIMETRO" ? "primary" : "secondary"}
              size="sm"
              onPress={() => setLayer("PERIMETRO")}
              style={styles.toggleButton}
            />
            <Button
              label={t("trace_layer_breadcrumb")}
              variant={layer === "BREADCRUMB" ? "primary" : "secondary"}
              size="sm"
              onPress={() => setLayer("BREADCRUMB")}
              style={styles.toggleButton}
            />
          </View>

          {facts.length === 0 ? (
            <EmptyState
              title={
                layer === "PERIMETRO"
                  ? t("trace_empty_perimeter")
                  : t("trace_empty_breadcrumb")
              }
              icon="location-outline"
            />
          ) : (
            <FlatList
              data={facts}
              keyExtractor={(fact) => fact.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => <FactRow fact={item} />}
            />
          )}
        </>
      ) : null}
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.layout.screenPadding,
    marginBottom: tokens.spacing.md,
  },
  toggleButton: { flex: 1 },
  listContent: {
    paddingHorizontal: tokens.layout.screenPadding,
    paddingBottom: tokens.spacing["4xl"],
  },
  factCard: { marginBottom: tokens.spacing.md },
  unreliableCard: { borderColor: tokens.colors.status.warning },
  factRow: { flexDirection: "row", alignItems: "flex-start" },
  factIcon: { marginRight: tokens.spacing.md, marginTop: 2 },
  factContent: { flex: 1 },
  factTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  factTitle: { ...FONT.bodyStrong, color: tokens.colors.text.primary },
  unreliableTag: {
    ...FONT.label,
    color: tokens.colors.status.warning,
    fontWeight: "800",
  },
  factCoords: { ...FONT.caption, color: tokens.colors.text.secondary, marginTop: 2 },
  factTime: { ...FONT.caption, color: tokens.colors.text.muted, marginTop: 2 },
  });
}
