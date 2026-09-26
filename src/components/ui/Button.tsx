import React from "react";
import {
  Text,
  StyleSheet,
  Pressable,
  PressableProps,
  ActivityIndicator,
  Platform,
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

// Importaciones del sistema de diseño y contexto

import { TOKENS, FONT } from "../../constants/theme";
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
  const scale = useSharedValue(1);
  const isDisabled = disabled || isLoading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (
    event: Parameters<NonNullable<PressableProps["onPressIn"]>>[0],
  ) => {
    if (!isDisabled) {
      scale.value = withSpring(INTERACTION.pressedScale, {
        damping: 20,
        stiffness: 300,
      });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
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

    if (Platform.OS !== "web") {
      if (variant === "danger") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (variant === "primary" || variant === "success") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }

    if (onPress) {
      onPress(event);
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: TOKENS.colors.primary,
          textColor: TOKENS.colors.text.inverse,
          borderColor: TOKENS.colors.primary,
        };
      case "secondary":
        return {
          backgroundColor: "transparent",
          textColor: TOKENS.colors.text.primary,
          borderColor: TOKENS.colors.border,
        };
      case "danger":
        return {
          backgroundColor: TOKENS.colors.status.danger,
          textColor: "#FFFFFF",
          borderColor: TOKENS.colors.status.danger,
        };
      case "success":
        return {
          backgroundColor: TOKENS.colors.status.success,
          textColor: "#FFFFFF",
          borderColor: TOKENS.colors.status.success,
        };
      case "ghost":
      default:
        return {
          backgroundColor: "transparent",
          textColor: TOKENS.colors.text.secondary,
          borderColor: "transparent",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return {
          height: 40,
          paddingHorizontal: TOKENS.spacing.md,
          fontSize: 14,
          iconSize: 16,
        };
      case "lg":
        return {
          height: 64,
          paddingHorizontal: TOKENS.spacing.xl,
          fontSize: 18,
          iconSize: 20,
        };
      case "md":
      default:
        return {
          height: 56,
          paddingHorizontal: TOKENS.spacing.lg,
          fontSize: 16,
          iconSize: 18,
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
          height: sizeStyles.height,
          paddingHorizontal: sizeStyles.paddingHorizontal,
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

          <Text
            style={[
              styles.label,
              { color: variantStyles.textColor, fontSize: sizeStyles.fontSize },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  button: {
    borderRadius: TOKENS.radius.md,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 44, // Accesibilidad: min touch target width
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: TOKENS.spacing.sm,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    ...FONT.bodyStrong,
  },
  disabled: {
    opacity: INTERACTION.disabledOpacity,
  },
});
