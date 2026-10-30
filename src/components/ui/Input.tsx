import React from "react";
import { View, Text, TextInput, TextInputProps, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  containerStyle?: ViewStyle;
}

export function Input({ label, error, icon, containerStyle, style, ...props }: InputProps) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.container, { marginBottom: tokens.spacing.md }, containerStyle]}>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: tokens.colors.text.secondary, marginBottom: tokens.spacing.xs },
          ]}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: tokens.colors.surface,
            borderColor: error ? tokens.colors.status.danger : tokens.colors.border,
            borderRadius: tokens.radius.md,
            paddingHorizontal: tokens.spacing.md,
          },
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon as any}
            size={18}
            color={tokens.colors.text.muted}
            style={[styles.icon, { marginRight: tokens.spacing.sm }]}
          />
        ) : null}
        <TextInput
          style={[
            styles.input,
            { color: tokens.colors.text.primary, paddingVertical: tokens.spacing.sm },
            style,
          ]}
          placeholderTextColor={tokens.colors.text.muted}
          {...props}
        />
      </View>

      {error ? (
        <Text
          style={[
            styles.errorText,
            { color: tokens.colors.status.danger, marginTop: tokens.spacing.xs },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    ...FONT.label,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    minHeight: 52,
  },
  icon: {},
  input: {
    flex: 1,
    ...FONT.body,
  },
  errorText: {
    ...FONT.caption,
    marginLeft: 4,
  },
});
