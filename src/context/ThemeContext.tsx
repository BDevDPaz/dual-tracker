/**
 * ThemeContext — fuente única de color: { scheme, colors, tokens, preference }.
 * La preferencia se persiste en settings.profile.theme (system | dark | light);
 * por defecto "dark" (app.json fija userInterfaceStyle "dark").
 *
 * Estado del modo claro: la paleta clara y el cableado existen en las
 * primitivas (src/components/ui, src/components/modals, ToastContext), pero las
 * pantallas de app/ todavía pintan con TOKENS (oscuro estático). Por eso NO hay
 * selector de tema en la UI: exponerlo daría pantallas mitad claras.
 */
import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { COLORS, TOKENS, type ColorScheme, type ThemeColors, type ThemePreference } from "../constants/theme";
import { Store } from "../core/store";

export interface ThemeContextType {
  scheme: ColorScheme;
  colors: ThemeColors;
  tokens: typeof TOKENS;
  preference: ThemePreference;
}

export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === "system") return system === "light" ? "light" : "dark";
  return preference;
}

export function themeFor(preference: ThemePreference, system?: string | null): ThemeContextType {
  const scheme = resolveScheme(preference, system);
  const colors = COLORS[scheme];
  return { scheme, colors, tokens: { ...TOKENS, colors }, preference };
}

/** Sin proveedor (tests de componentes, previsualizaciones) → oscuro por defecto. */
const DEFAULT_THEME = themeFor("dark");
const ThemeContext = createContext<ThemeContextType>(DEFAULT_THEME);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Fuerza una preferencia (tests). Sin ella se lee settings.profile.theme del store. */
  preference?: ThemePreference;
}

function useStoredPreference(): ThemePreference {
  const [pref, setPref] = React.useState<ThemePreference>(() => Store.getState().settings.profile.theme ?? "dark");
  React.useEffect(
    () =>
      Store.subscribe(() => {
        setPref(Store.getState().settings.profile.theme ?? "dark");
      }),
    [],
  );
  return pref;
}

export function ThemeProvider({ children, preference }: ThemeProviderProps) {
  const stored = useStoredPreference();
  const system = useColorScheme();
  const pref = preference ?? stored;
  const value = useMemo(() => themeFor(pref, system), [pref, system]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Tema activo (fuera de un ThemeProvider devuelve el oscuro). */
export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
