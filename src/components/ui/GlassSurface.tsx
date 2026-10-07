/**
 * Cristal ("Luxury Glass"): expo-blur (tinte oscuro) + relleno blanco 12 % +
 * filo dorado de 1 px rgba(212,175,55,0.18). Se usa en el hero y en ModalShell.
 * Caída a surfaceElevated sólido cuando:
 *  - el desenfoque no está disponible (Android: expo-blur sin el método
 *    experimental solo pinta un velo, así que se prefiere el sólido), o
 *  - el usuario activó "Reducir transparencia" (AccessibilityInfo).
 */
import React from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../context/ThemeContext";
import { useReduceTransparency } from "./motion";

/** Plataformas donde BlurView desenfoca de verdad. */
export const BLUR_SUPPORTED = Platform.OS === "ios" || Platform.OS === "web";

export function useGlass(): { glass: boolean; containerStyle: ViewStyle } {
  const { colors } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const glass = BLUR_SUPPORTED && !reduceTransparency;
  return glass
    ? { glass, containerStyle: { backgroundColor: "transparent", borderColor: colors.glass.hairline, borderWidth: 1, overflow: "hidden" } }
    : { glass, containerStyle: { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 } };
}

/** Capas de fondo (desenfoque + relleno). Primer hijo de un contenedor con useGlass().containerStyle. */
export function GlassLayers({ enabled }: { enabled: boolean }) {
  const { colors } = useTheme();
  if (!enabled) return null;
  return (
    <>
      <BlurView tint={colors.glass.blurTint} intensity={40} style={StyleSheet.absoluteFill} testID="glass-blur" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass.fill }]} />
    </>
  );
}
