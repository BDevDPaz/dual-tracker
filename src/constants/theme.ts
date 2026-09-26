/**
 * THEME TOKENS - Luxury Glass Dark
 * Sistema de diseño endurecido para Dual Tracker (heredado de GEOTrack Trial and Trace).
 */

export const PALETTE = {
  obsidian: "#0A0A0C", // Fondo principal
  graphite: "#121214", // Fondos secundarios (ej. inputs, pills)
  carbonMist: "#1C1C1F", // Capas de elevación (ej. tarjetas, modales)
  steelLine: "#2A2A2E", // Bordes y divisores estructurales
  textPrimary: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted: "#52525B",
  mutedGold: "#D4AF37", // Acento principal
  successGreen: "#27AE60",
  amberWarning: "#F2994A",
  deepRed: "#EB5757",
  slateBlue: "#546E7A",
};

export const TOKENS = {
  colors: {
    background: PALETTE.obsidian,
    surface: PALETTE.graphite,
    surfaceElevated: PALETTE.carbonMist,
    primary: PALETTE.mutedGold,
    border: PALETTE.steelLine,
    text: {
      primary: PALETTE.textPrimary,
      secondary: PALETTE.textSecondary,
      muted: PALETTE.textMuted,
      inverse: PALETTE.obsidian,
    },
    status: {
      success: PALETTE.successGreen,
      warning: PALETTE.amberWarning,
      danger: PALETTE.deepRed,
      info: PALETTE.slateBlue,
    },
    overlay: "rgba(0, 0, 0, 0.6)",
  },
  spacing: {
    zero: 0,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
    "3xl": 48,
    "4xl": 64,
  },
  radius: {
    none: 0,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
    round: 9999,
  },
  layout: {
    screenPadding: 24,
    sectionGap: 32,
    cardPadding: 16,
    minTouchTarget: 44,
  },
  shadows: {
    none: {
      shadowColor: "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 12,
    },
  },
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    modal: 2000,
    toast: 3000,
    overlay: 4000,
  },
};

// --- MANTENIMIENTO DE COMPATIBILIDAD HACIA ATRÁS ---
export const RADIUS = {
  round: TOKENS.radius.round,
  cards: TOKENS.radius.lg,
  inputs: TOKENS.radius.md,
};

export const SPACING = {
  xs: TOKENS.spacing.xs,
  sm: TOKENS.spacing.sm,
  md: TOKENS.spacing.md,
  lg: TOKENS.spacing.lg,
  xl: TOKENS.spacing.xl,
  xxl: TOKENS.spacing["2xl"],
};

export const FONT = {
  h1: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: "600" as const },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "500" as const },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1 },
};
