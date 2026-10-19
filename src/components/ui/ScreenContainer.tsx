import React from "react";
import { View, StyleSheet, ViewStyle, StatusBar, type StyleProp } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../i18n";
import { useResponsive } from "./responsive";

export type SafeEdge = Edge;

/** Pestaña: la barra de tabs ya ocupa la navegación del sistema. */
export const SAFE_EDGES = {
  all: ["top", "right", "bottom", "left"] as const,
  tab: ["top", "right", "left"] as const,
  /** Header nativo: la barra de estado ya está ocupada; sí hace falta el borde inferior. */
  stack: ["right", "bottom", "left"] as const,
  none: [] as const,
};

interface ScreenContainerProps {
  children: React.ReactNode;
  noPadding?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  useSafeArea?: boolean;
  /** Por defecto los cuatro bordes. Las pestañas usan SAFE_EDGES.tab y las pilas SAFE_EDGES.stack. */
  edges?: readonly SafeEdge[];
}

export function ScreenContainer({
  children,
  noPadding = false,
  style,
  testID,
  useSafeArea = true,
  edges = SAFE_EDGES.all,
}: ScreenContainerProps) {
  const { colors, scheme } = useTheme();
  useLanguage();
  const { screenPadding, contentMaxWidth } = useResponsive();
  const content = (
    <View
      style={[styles.innerContainer, !noPadding && { paddingHorizontal: screenPadding }, contentMaxWidth != null && styles.centered, contentMaxWidth != null && { maxWidth: contentMaxWidth }, style]}
      testID={testID}
    >
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      {children}
    </View>
  );

  if (useSafeArea) {
    return (
      <SafeAreaView edges={edges as Edge[]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {content}
      </SafeAreaView>
    );
  }

  return <View style={[styles.safeArea, { backgroundColor: colors.background }]}>{content}</View>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  centered: {
    alignSelf: "center",
  },
});

export const SCREEN_PADDING = TOKENS.layout.screenPadding;
