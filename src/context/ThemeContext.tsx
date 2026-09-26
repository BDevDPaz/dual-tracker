import React, { createContext, useContext, useMemo } from "react";
import { PALETTE } from "../constants/theme";

// Definimos la interfaz del contexto.
// Esto permite que el autocompletado en Neovim te sugiera los colores exactos.
interface ThemeContextType {
  colors: typeof PALETTE;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Memorizamos el valor del contexto para optimizar el rendimiento.
  // Al ser la base del diseño Luxury Glass Dark, actualmente inyectamos PALETTE directamente.
  const value = useMemo(
    () => ({
      colors: PALETTE,
    }),
    [],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// Hook personalizado para consumir el tema en cualquier componente funcional
export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error(
      "useTheme debe ser consumido estrictamente dentro de un ThemeProvider",
    );
  }

  return context;
}
