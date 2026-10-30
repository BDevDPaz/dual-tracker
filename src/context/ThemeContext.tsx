import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTokens, ThemeMode, AppTokens } from "../constants/theme";

const STORAGE_KEY = "dualtracker-theme-mode";

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  tokens: AppTokens;
  /** Alias directo a tokens.colors (nuevo API) */
  colors: AppTokens["colors"];
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function resolveInitialMode(system: ColorSchemeName): ThemeMode {
  return system === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = Appearance.getColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => resolveInitialMode(systemScheme));

  // Cargar preferencia guardada
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === "dark" || saved === "light") {
          setModeState(saved);
        }
      } catch {}
    })();
  }, []);

  // Escuchar cambios del sistema si no hay preferencia manual
  // (opcional: si quieres forzar manual, elimina este listener)
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      // Solo auto-cambia si no hay valor guardado
      AsyncStorage.getItem(STORAGE_KEY)
        .then((saved) => {
          if (!saved) setModeState(resolveInitialMode(colorScheme));
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const tokens = useMemo(() => getTokens(mode), [mode]);
  const value = useMemo<ThemeContextType>(
    () => ({
      mode,
      isDark: mode === "dark",
      tokens,
      colors: tokens.colors,
      setMode,
      toggleMode,
    }),
    [mode, tokens, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}

/**
 * Migración desde el ThemeContext anterior:
 *
 * Antes:
 *   const { colors } = useTheme(); // colors = PALETTE (obsidian, graphite...)
 *
 * Ahora:
 *   const { tokens, mode } = useTheme();
 *   tokens.colors.background
 *   tokens.colors.surfaceElevated
 *   tokens.colors.primary
 *   tokens.colors.text.primary
 *
 * El campo `colors` sigue existiendo como alias a `tokens.colors`
 * para no romper componentes, pero se recomienda usar `tokens`.
 */
