import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { StatusPill, StatusType } from "./StatusPill";
import { Button, ButtonVariant } from "./Button";

export type EngineState =
  | "IDLE"
  | "GEOFENCE_CREATED"
  | "TRAVEL"
  | "ACTIVE_WORK"
  | "PAUSED"
  | "PENDING_EXIT_CONFIRMATION"
  | "CLOSED";

interface OperationalHeroCardProps {
  state: EngineState;
  destination?: string;
  timeString: string;
  earnings: string;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
}

export const OperationalHeroCard = React.memo(function OperationalHeroCard({
  state,
  destination,
  timeString,
  earnings,
  onPrimaryAction,
  onSecondaryAction,
}: OperationalHeroCardProps) {
  const { tokens } = useTheme();

  const getStateConfig = () => {
    switch (state) {
      case "IDLE":
        return {
          pillState: "info" as StatusType,
          pillLabel: "IDLE",
          primaryLabel: "Configurar jornada",
          primaryVariant: "primary" as ButtonVariant,
          secondaryLabel: null,
        };
      case "GEOFENCE_CREATED":
        return {
          pillState: "pending" as StatusType,
          pillLabel: "Esperando llegada",
          primaryLabel: "Confirmar llegada",
          primaryVariant: "primary" as ButtonVariant,
          secondaryLabel: null,
        };
      case "TRAVEL":
        return {
          pillState: "ACTIVE_WORK" as StatusType,
          pillLabel: "En tránsito",
          primaryLabel: "Llegué al sitio",
          primaryVariant: "primary" as ButtonVariant,
          secondaryLabel: null,
        };
      case "ACTIVE_WORK":
        return {
          pillState: "ACTIVE_WORK" as StatusType,
          pillLabel: "Jornada Activa",
          primaryLabel: "Terminar jornada",
          primaryVariant: "danger" as ButtonVariant,
          secondaryLabel: "Pausar",
        };
      case "PAUSED":
        return {
          pillState: "warning" as StatusType,
          pillLabel: "Pausado",
          primaryLabel: "Reanudar",
          primaryVariant: "primary" as ButtonVariant,
          secondaryLabel: "Terminar jornada",
        };
      case "PENDING_EXIT_CONFIRMATION":
        return {
          pillState: "warning" as StatusType,
          pillLabel: "Pendiente confirmación",
          primaryLabel: "Terminar jornada",
          primaryVariant: "danger" as ButtonVariant,
          secondaryLabel: "Otro trabajo",
        };
      case "CLOSED":
        return {
          pillState: "info" as StatusType,
          pillLabel: "Cerrada",
          primaryLabel: "Finalizar y guardar",
          primaryVariant: "primary" as ButtonVariant,
          secondaryLabel: null,
        };
      default:
        return {
          pillState: "info" as StatusType,
          pillLabel: "Estado desconocido",
          primaryLabel: "Actualizar",
          primaryVariant: "primary" as ButtonVariant,
          secondaryLabel: null,
        };
    }
  };

  const config = getStateConfig();

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[
        styles.cardContainer,
        {
          backgroundColor: tokens.colors.surfaceElevated,
          borderColor: tokens.colors.border,
          marginHorizontal: tokens.layout.screenPadding,
          borderRadius: tokens.radius.lg,
          padding: tokens.spacing.xl,
          ...tokens.shadows.md,
        },
      ]}
    >
      <View style={[styles.headerRow, { marginBottom: tokens.spacing.lg }]}>
        <StatusPill status={config.pillState} label={config.pillLabel} />
        {destination && (
          <Text
            style={[
              styles.destinationText,
              { color: tokens.colors.text.primary, marginLeft: tokens.spacing.md },
            ]}
            numberOfLines={1}
          >
            {destination}
          </Text>
        )}
      </View>

      <View style={[styles.metricsRow, { marginBottom: tokens.spacing.xl }]}>
        <View style={styles.metricBlock}>
          <Text
            style={[
              styles.metricLabel,
              { color: tokens.colors.text.secondary, marginBottom: tokens.spacing.xs },
            ]}
          >
            TIEMPO ACUMULADO
          </Text>
          <Text style={[styles.metricBigValue, { color: tokens.colors.text.primary }]}>
            {timeString}
          </Text>
        </View>

        <View style={styles.metricBlockRight}>
          <Text
            style={[
              styles.metricLabel,
              { color: tokens.colors.text.secondary, marginBottom: tokens.spacing.xs },
            ]}
          >
            GANANCIA EST.
          </Text>
          <Text style={[styles.metricBigValue, { color: tokens.colors.primary }]}>{earnings}</Text>
        </View>
      </View>

      <View style={[styles.actionRow, { gap: tokens.spacing.md }]}>
        <Button
          label={config.primaryLabel}
          variant={config.primaryVariant}
          onPress={onPrimaryAction}
          style={styles.flexButton}
        />
        {config.secondaryLabel && onSecondaryAction && (
          <Button
            label={config.secondaryLabel}
            variant="secondary"
            onPress={onSecondaryAction}
            style={styles.flexButton}
          />
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  destinationText: {
    ...FONT.bodyStrong,
    flex: 1,
    textAlign: "right",
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricBlock: {
    flex: 1,
  },
  metricBlockRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  metricLabel: {
    ...FONT.label,
  },
  metricBigValue: {
    ...FONT.h1,
    fontSize: 36,
  },
  actionRow: {
    flexDirection: "row",
  },
  flexButton: {
    flex: 1,
  },
});
