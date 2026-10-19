import React from "react";
import {
  Text,
  StyleSheet,
  Pressable,
  PressableProps,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { haptics, useMotionPreference } from "./motion";

// Importaciones del sistema de diseño y contexto

import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { INTERACTION } from "../../constants/animations";

export type ButtonVariant =
  "primary" | "secondary" | "danger" | "ghost" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
  iconName?: React.ComponentProps<typeof Ionicons>["name"];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Button = React.memo(function Button({
  label,
  variant = "primary",
  size = "md",
  isLoading = false,
  style,
  onPress,
  disabled = false,
  onPressIn,
  onPressOut,
  iconName,
  ...props
}: ButtonProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const scale = useSharedValue(1);
  const isDisabled = disabled || isLoading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (
    event: Parameters<NonNullable<PressableProps["onPressIn"]>>[0],
  ) => {
    if (!isDisabled) {
      if (!reduceMotion) {
        scale.value = withSpring(INTERACTION.pressedScale, {
          damping: 20,
          stiffness: 300,
        });
      }
      haptics.impact(Haptics.ImpactFeedbackStyle.Light, reduceMotion);
    }

    if (onPressIn) {
      onPressIn(event);
    }
  };

  const handlePressOut = (
    event: Parameters<NonNullable<PressableProps["onPressOut"]>>[0],
  ) => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
    if (onPressOut) {
      onPressOut(event);
    }
  };

  const handlePress = (
    event: Parameters<NonNullable<PressableProps["onPress"]>>[0],
  ) => {
    if (isDisabled) {
      return;
    }

    if (variant === "danger") {
      haptics.notify(Haptics.NotificationFeedbackType.Warning, reduceMotion);
    } else if (variant === "primary" || variant === "success") {
      haptics.impact(Haptics.ImpactFeedbackStyle.Medium, reduceMotion);
    }

    if (onPress) {
      onPress(event);
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: colors.primary,
          textColor: colors.text.inverse,
          borderColor: colors.primary,
        };
      case "secondary":
        return {
          backgroundColor: "transparent",
          textColor: colors.text.primary,
          borderColor: colors.border,
        };
      case "danger":
        return {
          backgroundColor: colors.status.danger,
          textColor: colors.onDanger,
          borderColor: colors.status.danger,
        };
      case "success":
        return {
          backgroundColor: colors.status.success,
          textColor: colors.onSuccess,
          borderColor: colors.status.success,
        };
      case "ghost":
      default:
        return {
          backgroundColor: "transparent",
          textColor: colors.text.secondary,
          borderColor: "transparent",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return {
          minHeight: TOKENS.layout.minTouchTarget,
          paddingHorizontal: TOKENS.spacing.md,
          label: FONT.buttonSm,
          iconSize: ICON.sm,
        };
      case "lg":
        return {
          minHeight: TOKENS.layout.buttonLg,
          paddingHorizontal: TOKENS.spacing.xl,
          label: FONT.buttonLg,
          iconSize: ICON.lg,
        };
      case "md":
      default:
        return {
          minHeight: TOKENS.layout.buttonMd,
          paddingHorizontal: TOKENS.spacing.lg,
          label: FONT.button,
          iconSize: ICON.md,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <AnimatedPressable
      {...props}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      style={[
        styles.button,
        {
          backgroundColor: variantStyles.backgroundColor,
          borderColor: variantStyles.borderColor,
          minHeight: sizeStyles.minHeight,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          paddingVertical: TOKENS.spacing.sm,
        },
        isDisabled && styles.disabled,
        style,
        animatedStyle,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={variantStyles.textColor} />
      ) : (
        <View style={styles.content}>
          {iconName ? (
            <Ionicons
              name={iconName}
              size={sizeStyles.iconSize}
              color={variantStyles.textColor}
              style={styles.icon}
            />
          ) : null}

          <Text style={[styles.label, sizeStyles.label, { color: variantStyles.textColor }]}>{label}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  button: {
    borderRadius: TOKENS.radius.md,
    borderWidth: TOKENS.layout.hairline,
    justifyContent: "center",
    alignItems: "center",
    minWidth: TOKENS.layout.minTouchTarget, // Accesibilidad: objetivo táctil mínimo
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: TOKENS.spacing.sm,
  },
  icon: {
    marginRight: TOKENS.spacing.zero,
  },
  label: {
    ...FONT.bodyStrong,
  },
  disabled: {
    opacity: INTERACTION.disabledOpacity,
  },
});
