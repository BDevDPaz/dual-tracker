import React from "react";
import { Stack } from "expo-router";

/**
 * Salud del sistema y resolución de conflicto se presentan como modal/card
 * full-screen, nunca como tab (blueprint §5.15/§5.16: "Presentado como modal
 * o card full-screen, no tab").
 */
export default function SystemLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: "modal",
        headerShown: false,
      }}
    >
      <Stack.Screen name="health" />
      <Stack.Screen name="conflict" />
    </Stack>
  );
}
