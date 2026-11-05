// app/_layout.tsx — RootLayout con dual boot: viejo + core-v2
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { ThemeProvider } from "../src/context/ThemeContext";
import { ToastProvider } from "../src/context/ToastContext";
import { FeedbackBridge } from "../src/components/feedback/FeedbackBridge";
import { boot, ensureRuntimeReady, registerBackgroundTasks } from "../src/core/boot";
import { initBootV2 } from "../src/core-v2/bootWiringV2"; // <-- NUEVO
import { TOKENS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n";

enableFreeze(false);
registerBackgroundTasks(); // viejo - lo dejamos

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const FONT_LOAD_TIMEOUT_MS = 3000;

export default function RootLayout() {
  useLanguage();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await ensureRuntimeReady();
      } catch {}
      try {
        await initBootV2(); // <-- NUEVO: programa 7am y 12:30pm + define GEOFENCE_TRACKING_TASK
        console.log("[ROOT] core-v2 boot ok");
      } catch (e) {
        console.warn("[ROOT] core-v2 boot fail", e);
      }
      if (live) setLangReady(true);
      void boot(); // viejo - lo dejamos para no romper hydrating.tsx
    })();
    return () => {
      live = false;
    };
  }, []);

  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFontTimeout(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);
  const fontsSettled = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (fontsSettled && langReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsSettled, langReady]);

  if (!fontsSettled || !langReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: TOKENS.colors.background }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <FeedbackBridge />
            <Stack screenOptions={{ headerShown: false, freezeOnBlur: false, contentStyle: { backgroundColor: TOKENS.colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(boot)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="session" />
              <Stack.Screen name="sites" />
              <Stack.Screen name="report" />
              <Stack.Screen name="system" options={{ presentation: "modal" }} />
              <Stack.Screen name="legal" />
              <Stack.Screen name="support" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
