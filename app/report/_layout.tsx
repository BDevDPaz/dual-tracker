import React from "react";
import { Stack } from "expo-router";

import { useTheme } from "../../src/context/ThemeContext";

/**
 * Stack de expedientes: estado de nómina de un periodo ([periodId]) y pack
 * ya sellado (pack/[packId]). Header nativo con título fijo "Expediente";
 * cada pantalla hija ajusta su propio subtítulo/contenido.
 */
export default function ReportLayout() {
  const { tokens } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitle: "Expediente",
        headerStyle: { backgroundColor: tokens.colors.background },
        headerTintColor: tokens.colors.text.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="[periodId]" />
      <Stack.Screen name="pack/[packId]" />
    </Stack>
  );
}
