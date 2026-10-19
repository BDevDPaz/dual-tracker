import React, { useRef } from "react";
import { Platform, ScrollView, StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from "react-native";
import { TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { KeyboardScrollProvider, useKeyboardInset } from "./keyboard";
import { useResponsive } from "./responsive";
import { SAFE_EDGES, ScreenContainer, type SafeEdge } from "./ScreenContainer";

interface ScreenScrollProps {
  children: React.ReactNode;
  edges?: readonly SafeEdge[];
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Pie fijo (Guardar, Editar). Queda por encima del teclado. */
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** false en pantallas sin campos (el teclado igual no estorba si queda en true). */
  keyboard?: boolean;
}

/**
 * Pantalla con scroll, área segura, columna centrada en pantallas anchas
 * y relleno para que el teclado no tape el campo enfocado.
 * Tocar fuera de un campo cierra el teclado (keyboardShouldPersistTaps="handled").
 */
export function ScreenScroll({
  children,
  edges = SAFE_EDGES.all,
  refreshControl,
  footer,
  contentContainerStyle,
  testID,
  keyboard = true,
}: ScreenScrollProps) {
  const { colors } = useTheme();
  const { screenPadding, contentMaxWidth } = useResponsive();
  const keyboardInset = useKeyboardInset();
  const scrollRef = useRef<ScrollView>(null);
  // iOS: el ScrollView ajusta el inset. Android con edge-to-edge: el gancho mide el solape real.
  const androidLift = keyboard && Platform.OS !== "ios" ? keyboardInset : 0;

  return (
    <ScreenContainer noPadding edges={edges} testID={testID}>
      <KeyboardScrollProvider scrollRef={scrollRef}>
        <View style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={keyboard && Platform.OS === "ios"}
            refreshControl={refreshControl}
            contentContainerStyle={[
              styles.content,
              {
                paddingHorizontal: screenPadding,
                paddingBottom: TOKENS.spacing["3xl"] + androidLift,
                maxWidth: contentMaxWidth,
              },
              contentContainerStyle,
            ]}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={[
                styles.footer,
                {
                  paddingHorizontal: screenPadding,
                  paddingBottom: TOKENS.spacing.lg + androidLift,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardScrollProvider>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, width: "100%" },
  content: {
    flexGrow: 1,
    width: "100%",
    alignSelf: "center",
    paddingTop: TOKENS.spacing.lg,
    gap: TOKENS.layout.sectionGap,
  },
  footer: {
    borderTopWidth: TOKENS.layout.hairline,
    paddingTop: TOKENS.spacing.md,
    gap: TOKENS.spacing.sm,
  },
});
