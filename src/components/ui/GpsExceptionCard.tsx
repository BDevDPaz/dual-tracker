import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { Button } from "./Button";
import { Card } from "./Card";
import type { GpsExceptionKind } from "./gpsException";

interface GpsExceptionCardProps {
  kind: GpsExceptionKind;
  busy?: boolean;
  /** Acción de la derecha (oro): seguir, o confirmar llegada en no show. */
  onPrimary: () => void;
  /** Acción de la izquierda: guía, decidir la salida, o seguir en no show. */
  onSecondary: () => void;
}

const COPY: Record<GpsExceptionKind, { title: string; body: string; primary: string; secondary: string; tone: "warning" | "danger" }> = {
  signal_delay: {
    title: "gps.signalDelayTitle",
    body: "gps.signalDelayBody",
    primary: "cta.stayOperating",
    secondary: "gps.openGuidance",
    tone: "warning",
  },
  gps_async: {
    title: "gps.asyncTitle",
    body: "gps.asyncBody",
    primary: "cta.stayOperating",
    secondary: "gps.openGuidance",
    tone: "warning",
  },
  no_show: {
    title: "gps.noShowTitle",
    body: "gps.noShowBody",
    primary: "cta.confirmArrival",
    secondary: "cta.stayOperating",
    tone: "danger",
  },
  zone_exit: {
    title: "gps.zoneExitTitle",
    body: "gps.zoneExitBody",
    primary: "cta.stayOperating",
    secondary: "cta.confirmExit",
    tone: "warning",
  },
};

/** Una línea de explicación y dos acciones. No cierra la jornada. */
export function GpsExceptionCard({ kind, busy = false, onPrimary, onSecondary }: GpsExceptionCardProps) {
  const { colors } = useTheme();
  useLanguage();
  const copy = COPY[kind];
  const tone = copy.tone === "danger" ? colors.status.danger : colors.status.warning;
  return (
    <Card testID={`gps-exception-${kind}`} style={{ borderColor: tone, borderWidth: TOKENS.layout.hairline }}>
      <Text style={[styles.title, { color: colors.text.primary }]}>{t(copy.title)}</Text>
      <Text style={[styles.body, { color: colors.text.secondary }]}>{t(copy.body)}</Text>
      <View style={styles.row}>
        <Button label={t(copy.secondary)} variant="secondary" onPress={onSecondary} disabled={busy} style={styles.flex} />
        <Button label={t(copy.primary)} variant="primary" onPress={onPrimary} isLoading={busy} style={styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...FONT.cardTitle, marginBottom: TOKENS.spacing.xs },
  body: { ...FONT.bodySmall, marginBottom: TOKENS.spacing.md },
  row: { flexDirection: "row", gap: TOKENS.spacing.sm },
  flex: { flex: 1 },
});
