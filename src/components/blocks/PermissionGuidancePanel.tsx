import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui/Button";

interface Props {
  body: string;
  steps: string[];
  extras?: string[];
  actionLabel?: string;
  accessibilityLabel: string;
  onAction?: () => void;
  disabled?: boolean;
}

/** Pasos compartidos por onboarding, Salud y Soporte. El botón abre el ajuste nativo. */
export function PermissionGuidancePanel({
  body,
  steps,
  extras = [],
  actionLabel,
  accessibilityLabel,
  onAction,
  disabled = false,
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.body, { color: colors.text.secondary }]}>{body}</Text>
      {steps.map((step, index) => (
        <Text key={`${index}-${step}`} style={[styles.step, { color: colors.text.secondary }]}>
          {`${index + 1}. ${step}`}
        </Text>
      ))}
      {extras.map((extra) => (
        <Text key={extra} style={[styles.body, { color: colors.text.secondary }]}>
          {extra}
        </Text>
      ))}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          accessibilityLabel={accessibilityLabel}
          variant="secondary"
          size="sm"
          onPress={onAction}
          disabled={disabled}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.sm },
  body: { ...FONT.caption },
  step: { ...FONT.caption },
});
