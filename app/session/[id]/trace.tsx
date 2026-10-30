import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import dayjs from "../../../src/utils/dayjsSetup";
import { FONT, type AppTokens } from "../../../src/constants/theme";
import { useTheme } from "../../../src/context/ThemeContext";
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

function factTypeLabel(type: SpatialFactType): string {
  switch (type) {
    case "ENTER":
      return "Entrada a geocerca";
    case "EXIT":
      return "Salida de geocerca";
    case "DWELL":
      return "Permanencia";
    case "BREADCRUMB":
      return "Miga de pan";
    case "ACCURACY_DROP":
      return "Caída de precisión";
    case "PROVIDER_LOSS":
      return "Pérdida de proveedor GPS";
    default:
      return type;
  }
}

function FactRow({ fact }: { fact: SpatialFact }) {
  const { tokens } = useTheme();
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
            <Text style={styles.factTitle}>{factTypeLabel(fact.type)}</Text>
            {unreliable ? <Text style={styles.unreliableTag}>NO FIABLE</Text> : null}
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
      <PageHeader title="Rastro" showBack onBack={() => router.back()} />

      {loading ? <LoadingOverlay visible message="Cargando rastro…" /> : null}

      {!loading && error ? (
        <EmptyState
          title="No se pudo cargar el rastro"
          description={error}
          icon="alert-circle-outline"
        />
      ) : null}

      {!loading && !error && totalFacts === 0 ? (
        <EmptyState title="Esta jornada se registró solo por geocerca." icon="location-outline" />
      ) : null}

      {!loading && !error && totalFacts > 0 ? (
        <>
          <View style={styles.toggleRow}>
            <Button
              label="Perímetro"
              variant={layer === "PERIMETRO" ? "primary" : "secondary"}
              size="sm"
              onPress={() => setLayer("PERIMETRO")}
              style={styles.toggleButton}
            />
            <Button
              label="Miga de pan"
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
                  ? "Sin hechos de perímetro registrados."
                  : "Sin puntos de miga de pan registrados."
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
