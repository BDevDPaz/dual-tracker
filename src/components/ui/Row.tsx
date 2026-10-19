import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { TOKENS } from "../../constants/theme";

type Gap = keyof typeof TOKENS.spacing;

/** Fila con salto de línea: las etiquetas largas (es) no empujan al icono fuera de la pantalla. */
export function Row({
  children,
  style,
  align = "center",
  gap = "sm",
  wrap = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  align?: "center" | "start" | "stretch";
  gap?: Gap;
  wrap?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        { alignItems: align === "start" ? "flex-start" : align === "stretch" ? "stretch" : "center", gap: TOKENS.spacing[gap], flexWrap: wrap ? "wrap" : "nowrap" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
});
