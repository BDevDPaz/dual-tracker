import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/context/ThemeContext";
import { ICONS } from "../../src/constants/icons";

/**
 * Tab bar canónica de Dual Tracker: Hoy, Historial, Reportes, Ajustes.
 * Migrada a useTheme() para que responda a Dark/Light en vivo.
 */
export default function TabsLayout() {
  const { tokens } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: tokens.colors.text.muted,
        tabBarStyle: {
          backgroundColor: tokens.colors.tabBar,
          borderTopColor: tokens.colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Hoy",
        tabBarIcon: ({ focused, color, size }) => (<Ionicons name={focused ? ICONS.tabs.home.active : ICONS.tabs.home.inactive} color={color} size={size} />) }} />
      <Tabs.Screen name="history" options={{ title: "Historial",
        tabBarIcon: ({ focused, color, size }) => (<Ionicons name={focused ? ICONS.tabs.history.active : ICONS.tabs.history.inactive} color={color} size={size} />) }} />
      <Tabs.Screen name="reports" options={{ title: "Reportes",
        tabBarIcon: ({ focused, color, size }) => (<Ionicons name={focused ? ICONS.tabs.report.active : ICONS.tabs.report.inactive} color={color} size={size} />) }} />
      <Tabs.Screen name="settings" options={{ title: "Ajustes",
        tabBarIcon: ({ focused, color, size }) => (<Ionicons name={focused ? ICONS.tabs.settings.active : ICONS.tabs.settings.inactive} color={color} size={size} />) }} />
    </Tabs>
  );
}
