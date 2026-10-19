/**
 * app/_layout.tsx — Layout raíz (Producto §3.1).
 * Carga Montserrat, envuelve ThemeContext y ToastContext, llama boot() de
 * src/core/boot.ts y registra las tareas de TaskOrchestrator en el ámbito
 * global del bundle. El entry index.js carga la definición headless antes
 * de React; aquí se reafirma (idempotente) por el camino que sí puede
 * importar app/. No pinta UI de negocio: la decisión de grupo visible
 * ((boot) / (onboarding) / (tabs)) la toma el gate app/index.tsx.
 */
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from "@expo-google-fonts/montserrat";
import { ThemeProvider } from "../src/context/ThemeContext";
import { ToastProvider } from "../src/context/ToastContext";
import { FeedbackBridge } from "../src/components/feedback/FeedbackBridge";
import { boot, registerBackgroundTasks } from "../src/core/boot";
import { TOKENS } from "../src/constants/theme";

// TaskManager.defineTask debe ejecutarse al evaluar el bundle, antes del primer render
// (también cuando el SO despierta la app en segundo plano sin UI).
registerBackgroundTasks();

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Si Montserrat no carga en este plazo se pinta con la fuente del sistema (nunca pantalla en blanco). */
const FONT_LOAD_TIMEOUT_MS = 3000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  useEffect(() => {
    // boot() es idempotente y publica el estado de hidratación en el store;
    // el gate reacciona a selectIsHydrated.
    void boot();
  }, []);

  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFontTimeout(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);
  const fontsSettled = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsSettled]);

  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: TOKENS.colors.background }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <FeedbackBridge />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: TOKENS.colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(boot)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="session" />
              <Stack.Screen name="sites" />
              <Stack.Screen name="report" />
              <Stack.Screen name="system" options={{ presentation: "modal" }} />
              <Stack.Screen name="legal" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
