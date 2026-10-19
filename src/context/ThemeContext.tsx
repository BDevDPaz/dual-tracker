/**
 * ThemeContext — fuente única de color: { scheme, colors, tokens, preference }.
 * La preferencia se persiste en settings.profile.theme (system | dark | light);
 * por defecto "dark" (app.json fija userInterfaceStyle "dark").
 *
 * Alto contraste (profile.highContrast) sustituye la paleta sin cambiar
 * system | dark | light. El selector claro sigue oculto: varias pantallas
 * aún pintan con TOKENS (oscuro estático).
 */
import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { COLORS, CONTRAST_COLORS, TOKENS, type ColorScheme, type ThemeColors, type ThemePreference } from "../constants/theme";
import { Store } from "../core/store";

export interface ThemeContextType {
  scheme: ColorScheme;
  colors: ThemeColors;
  tokens: typeof TOKENS;
  preference: ThemePreference;
  highContrast: boolean;
}

export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === "system") return system === "light" ? "light" : "dark";
  return preference;
}

export function themeFor(preference: ThemePreference, system?: string | null, highContrast = false): ThemeContextType {
  const scheme = highContrast ? "dark" : resolveScheme(preference, system);
  const colors = highContrast ? CONTRAST_COLORS : COLORS[scheme];
  return { scheme, colors, tokens: { ...TOKENS, colors }, preference, highContrast };
}

/** Sin proveedor (tests de componentes, previsualizaciones) → oscuro por defecto. */
const DEFAULT_THEME = themeFor("dark");
const ThemeContext = createContext<ThemeContextType>(DEFAULT_THEME);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Fuerza una preferencia (tests). Sin ella se lee settings.profile.theme del store. */
  preference?: ThemePreference;
}

function useStoredVisual(): { preference: ThemePreference; highContrast: boolean } {
  const read = () => {
    const profile = Store.getState().settings.profile;
    return { preference: profile.theme ?? "dark", highContrast: profile.highContrast === true };
  };
  const [visual, setVisual] = React.useState(read);
  React.useEffect(() => Store.subscribe(() => setVisual(read())), []);
  return visual;
}

export function ThemeProvider({ children, preference }: ThemeProviderProps) {
  const stored = useStoredVisual();
  const system = useColorScheme();
  const pref = preference ?? stored.preference;
  const value = useMemo(() => themeFor(pref, system, stored.highContrast), [pref, system, stored.highContrast]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Tema activo (fuera de un ThemeProvider devuelve el oscuro). */
export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
