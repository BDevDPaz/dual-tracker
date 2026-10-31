import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import type { PermissionState } from "../../core/contracts";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatusPill } from "../ui/StatusPill";
import { PermissionGuidancePanel } from "./PermissionGuidancePanel";

export interface PermissionGuidanceContent {
  body: string;
  steps: string[];
  extras?: string[];
  actionLabel: string;
  accessibilityLabel: string;
}

function pillTone(state: PermissionState): "success" | "neutral" | "warning" {
  if (state === "granted") return "success";
  if (state === "unknown") return "neutral";
  return "warning";
}

function PermissionCardHeader({
  title,
  pill,
  state,
  granted,
  open,
  enabled,
  pendingLabel,
  onToggle,
}: {
  title: string;
  pill: string;
  state: PermissionState;
  granted: boolean;
  open: boolean;
  enabled: boolean;
  pendingLabel?: string;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessible={granted}
      accessibilityRole={granted ? "button" : undefined}
      accessibilityLabel={granted ? t("a11y.permissionGranted", { title, state: pill }) : undefined}
      accessibilityState={granted ? { expanded: open } : undefined}
      disabled={!granted}
      onPress={granted ? onToggle : undefined}
      style={styles.header}
    >
      <View style={styles.row}>
        <Text accessibilityLabel={pendingLabel} style={[styles.title, { color: enabled || granted ? colors.text.primary : colors.text.secondary }]}>
          {title}
        </Text>
        <StatusPill tone={pillTone(state)} label={pill} />
      </View>
    </Pressable>
  );
}

function PermissionCardActions({
  open,
  granted,
  blocked,
  hideRequest,
  hasGuidance,
  enabled,
  onRequest,
  onOpenSettings,
}: {
  open: boolean;
  granted: boolean;
  blocked: boolean;
  hideRequest: boolean;
  hasGuidance: boolean;
  enabled: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  if (!open || granted) return null;
  if (blocked && !hasGuidance) {
    return <Button label={t("onboarding.permOpenSettings")} variant="secondary" size="sm" onPress={onOpenSettings} disabled={!enabled} />;
  }
  if (!blocked && !hideRequest) {
    return <Button label={t("onboarding.permRequest")} size="sm" onPress={onRequest} disabled={!enabled} />;
  }
  return null;
}

/** Tarjeta secuencial de permiso (Producto §5.5): estado granted / denied / blocked. */
interface Props {
  title: string;
  body: string;
  state: PermissionState;
  enabled: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
  testID?: string;
  highlighted?: boolean;
  guidance?: PermissionGuidanceContent | null;
  statusLabel?: string;
  /** La batería no tiene diálogo del sistema: solo el ajuste. */
  hideRequest?: boolean;
}

export function PermissionCard({
  title,
  body,
  state,
  enabled,
  onRequest,
  onOpenSettings,
  testID,
  highlighted = false,
  guidance = null,
  statusLabel,
  hideRequest = false,
}: Props) {
  useLanguage();
  const { colors } = useTheme();
  const granted = state === "granted";
  const [expanded, setExpanded] = useState(false);
  const open = granted ? expanded : true;

  const pill = statusLabel ?? t(`permission.${state}`);
  const showBody = open && body.length > 0 && body !== guidance?.body;
  const pendingLabel = highlighted ? t("a11y.permissionPending", { title }) : undefined;
  const highlightStyle = highlighted ? { borderColor: colors.goldText, backgroundColor: colors.glass.fill } : null;

  return (
    <Card testID={testID} style={[styles.card, highlightStyle]}>
      <PermissionCardHeader
        title={title}
        pill={pill}
        state={state}
        granted={granted}
        open={open}
        enabled={enabled}
        pendingLabel={pendingLabel}
        onToggle={() => setExpanded((value) => !value)}
      />
      {showBody ? <Text style={[styles.body, { color: colors.text.secondary }]}>{body}</Text> : null}
      {open && guidance ? (
        <PermissionGuidancePanel
          body={guidance.body}
          steps={guidance.steps}
          extras={guidance.extras}
          actionLabel={guidance.actionLabel}
          accessibilityLabel={guidance.accessibilityLabel}
          onAction={onOpenSettings}
          disabled={!enabled}
        />
      ) : null}
      <PermissionCardActions
        open={open}
        granted={granted}
        blocked={state === "blocked"}
        hideRequest={hideRequest}
        hasGuidance={guidance != null}
        enabled={enabled}
        onRequest={onRequest}
        onOpenSettings={onOpenSettings}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: TOKENS.spacing.md, padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  header: { minHeight: TOKENS.layout.minTouchTarget, justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong, flex: 1 },
  body: { ...FONT.caption },
});
