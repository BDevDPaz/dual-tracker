import React from "react";
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT } from "../../constants/theme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  icon,
  containerStyle,
  style,
  ...props
}: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: TOKENS.colors.surface,
            borderColor: error
              ? TOKENS.colors.status.danger
              : TOKENS.colors.border,
          },
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon as any}
            size={18}
            color={TOKENS.colors.text.muted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[styles.input, { color: TOKENS.colors.text.primary }, style]}
          placeholderTextColor={TOKENS.colors.text.muted}
          {...props}
        />
      </View>

      {error ? (
        <Text
          style={[styles.errorText, { color: TOKENS.colors.status.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: TOKENS.spacing.md,
    width: "100%",
  },
  label: {
    ...FONT.label,
    marginBottom: TOKENS.spacing.xs,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: TOKENS.radius.md,
    borderWidth: 1,
    paddingHorizontal: TOKENS.spacing.md,
    minHeight: 52,
  },
  icon: {
    marginRight: TOKENS.spacing.sm,
  },
  input: {
    flex: 1,
    ...FONT.body,
    paddingVertical: TOKENS.spacing.sm,
  },
  errorText: {
    ...FONT.caption,
    marginTop: TOKENS.spacing.xs,
    marginLeft: 4,
  },
});
