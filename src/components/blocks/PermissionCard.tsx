import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import type { PermissionState } from "../../core/contracts";
import { t } from "../../i18n";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatusPill } from "../ui/StatusPill";

/** Tarjeta secuencial de permiso (Producto §5.5): estado granted / denied / blocked. */
interface Props {
  title: string;
  body: string;
  state: PermissionState;
  enabled: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
}

export function PermissionCard({ title, body, state, enabled, onRequest, onOpenSettings }: Props) {
  const tone = state === "granted" ? "success" : state === "unknown" ? "neutral" : "warning";
  return (
    <Card style={[styles.card, !enabled && styles.disabled]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{title}</Text>
        <StatusPill tone={tone} label={t(`permission.${state}`)} />
      </View>
      <Text style={[styles.body, { color: TOKENS.colors.text.secondary }]}>{body}</Text>
      {state !== "granted" ? (
        state === "blocked" ? (
          <Button label={t("onboarding.permOpenSettings")} variant="secondary" size="sm" onPress={onOpenSettings} disabled={!enabled} />
        ) : (
          <Button label={t("onboarding.permRequest")} size="sm" onPress={onRequest} disabled={!enabled} />
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: TOKENS.spacing.md, padding: TOKENS.spacing.lg },
  disabled: { opacity: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong, flex: 1 },
  body: { ...FONT.caption, marginBottom: TOKENS.spacing.md },
});
