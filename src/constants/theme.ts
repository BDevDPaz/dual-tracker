/**
 * THEME TOKENS - Luxury Glass Dark
 * Sistema de diseño endurecido para Dual Tracker (heredado de GEOTrack Trial and Trace).
 */

import { Platform } from "react-native";

export type ColorScheme = "dark" | "light";
/** Preferencia persistida en profile.theme. */
export type ThemePreference = "system" | "dark" | "light";

/** Paleta oscura (por defecto, userInterfaceStyle "dark"). */
export const PALETTE_DARK = {
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

/** Paleta clara ("papel"): preparada y cableada en primitivas; el selector sigue oculto. */
export const PALETTE_LIGHT: typeof PALETTE_DARK = {
  obsidian: "#F4F1EA", // paper
  graphite: "#ECE7DC",
  carbonMist: "#FBF9F4",
  steelLine: "#D6CFC1",
  textPrimary: "#1A1714", // ink
  textSecondary: "#5A534A",
  textMuted: "#8A8378",
  mutedGold: "#8A6D1F", // gold
  successGreen: "#1E7F47",
  amberWarning: "#A85A12",
  deepRed: "#B83227",
  slateBlue: "#3F5963",
};

/** Compatibilidad: PALETTE sigue siendo la oscura. */
export const PALETTE = PALETTE_DARK;

/** "#RRGGBB" + alfa → rgba() fijo (sustituye los `${color}15` sueltos). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const STATUS_BG_ALPHA = 0.12;

function buildColors(p: typeof PALETTE_DARK, scheme: ColorScheme) {
  return {
    background: p.obsidian,
    surface: p.graphite,
    surfaceElevated: p.carbonMist,
    primary: p.mutedGold,
    border: p.steelLine,
    text: {
      primary: p.textPrimary,
      secondary: p.textSecondary,
      muted: p.textMuted,
      inverse: p.obsidian,
    },
    status: {
      success: p.successGreen,
      warning: p.amberWarning,
      danger: p.deepRed,
      info: p.slateBlue,
    },
    /** Fondo tenue por tono (StatusPill, IntegrityBadge, icono de ModalShell…). */
    statusBg: {
      success: withAlpha(p.successGreen, STATUS_BG_ALPHA),
      warning: withAlpha(p.amberWarning, STATUS_BG_ALPHA),
      danger: withAlpha(p.deepRed, STATUS_BG_ALPHA),
      info: withAlpha(p.slateBlue, STATUS_BG_ALPHA),
      primary: withAlpha(p.mutedGold, STATUS_BG_ALPHA),
    },
    /** Texto sobre botones sólidos danger/success. */
    onDanger: "#FFFFFF",
    onSuccess: "#FFFFFF",
    /** Anillo de foco de Input: primario al 40 %. */
    focusRing: withAlpha(p.mutedGold, 0.4),
    overlay: scheme === "dark" ? "rgba(0, 0, 0, 0.6)" : "rgba(26, 23, 20, 0.35)",
    /** Cristal (hero y modales): relleno blanco 12 % + filo dorado 1 px. */
    glass: {
      fill: scheme === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.55)",
      hairline: "rgba(212, 175, 55, 0.18)",
      blurTint: scheme === "dark" ? ("dark" as const) : ("light" as const),
    },
    /** "Papel" de la vista previa del reporte (igual en ambos esquemas: es un documento). */
    paper: {
      background: "#EAECEE",
      ink: "#1A1A1A",
      text: "#333333",
      muted: "#666666",
      label: "#888888",
      line: "#CCCCCC",
      skeleton: "#D1D5DB",
    },
    /** Pista de las líneas decorativas (AppBrandTitle, spinner). */
    track: scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(26, 23, 20, 0.08)",
  };
}

export type ThemeColors = ReturnType<typeof buildColors>;

export const COLORS: Record<ColorScheme, ThemeColors> = {
  dark: buildColors(PALETTE_DARK, "dark"),
  light: buildColors(PALETTE_LIGHT, "light"),
};

/**
 * Anchos de referencia (dp). compact ≈ teléfonos 320–359; regular ≈ 360–599
 * (Galaxy S22+ entra aquí); expanded ≈ plegable abierto; tablet ≥ 840.
 */
export const BREAKPOINTS = {
  compact: 360,
  expanded: 600,
  tablet: 840,
} as const;

export type BreakpointName = "compact" | "regular" | "expanded" | "tablet";

export function breakpointFor(width: number): BreakpointName {
  if (width >= BREAKPOINTS.tablet) return "tablet";
  if (width >= BREAKPOINTS.expanded) return "expanded";
  if (width < BREAKPOINTS.compact) return "compact";
  return "regular";
}

export function isLandscape(width: number, height: number): boolean {
  return width > height;
}

export function screenPaddingFor(width: number): number {
  return breakpointFor(width) === "compact" ? TOKENS.layout.screenPaddingCompact : TOKENS.layout.screenPadding;
}

/** En tablet, o en plegable apaisado, la columna de lectura no se estira de borde a borde. */
export function contentMaxWidthFor(width: number, height: number): number | undefined {
  const bp = breakpointFor(width);
  if (bp === "tablet" || (bp === "expanded" && isLandscape(width, height))) return TOKENS.layout.readableMax;
  return undefined;
}

/** Tamaños de icono Ionicons. No usar números sueltos en size={}. */
export const ICON = {
  xs: 12,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
  xxl: 28,
  hero: 48,
} as const;

export const TOKENS = {
  /** Estático = oscuro. Las primitivas leen useTheme().colors. */
  colors: COLORS.dark,
  spacing: {
    zero: 0,
    /** Ritmo mínimo entre metadatos apilados (2 dp). */
    xxs: 2,
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
    /** Marca de 2 dp (barra de progreso, subrayado de marca). */
    hairline: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
    round: 9999,
  },
  layout: {
    /** Teléfono normal, plegable y tablet. */
    screenPadding: 24,
    /** Teléfono estrecho (< 360 dp): un paso menos de la escala. */
    screenPaddingCompact: 16,
    sectionGap: 32,
    cardPadding: 16,
    /** Objetivo táctil mínimo (48 dp). Botones, chips, iconos de cierre y filas pulsables. */
    minTouchTarget: 48,
    buttonMd: 56,
    buttonLg: 64,
    inputMin: 48,
    textArea: 96,
    textAreaLg: 128,
    /** Ancho de lectura en tablet / plegable apaisado. */
    readableMax: 720,
    hairline: 1,
    /** Anillo de foco del campo (no desplaza el layout). */
    focusOutline: 3,
    metricRule: 40,
    brandGlowWidth: 44,
    brandGlowHeight: 26,
    brandLine: 120,
    /** Hoja modal: fracción de la ventana. */
    sheetMaxRatio: 0.9,
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

export type FontWeight = "400" | "500" | "600" | "700" | "800";

/** Familias de @expo-google-fonts/montserrat cargadas con useFonts en app/_layout.tsx. */
export const FONT_FAMILY: Record<FontWeight, string> = {
  "400": "Montserrat_400Regular",
  "500": "Montserrat_500Medium",
  "600": "Montserrat_600SemiBold",
  "700": "Montserrat_700Bold",
  "800": "Montserrat_800ExtraBold",
};

/**
 * Montserrat del peso pedido. En Android la familia ya ES el peso (sumar
 * fontWeight provoca negrita sintética o caída a la fuente del sistema); en
 * iOS/web se conserva fontWeight para que, si las fuentes no cargan, la caída
 * a la fuente del sistema mantenga la jerarquía.
 */
export function font(weight: FontWeight): { fontFamily: string; fontWeight?: FontWeight } {
  return Platform.OS === "android" ? { fontFamily: FONT_FAMILY[weight] } : { fontFamily: FONT_FAMILY[weight], fontWeight: weight };
}

const TABULAR_NUMS = ["tabular-nums"] as ["tabular-nums"];

export const FONT = {
  h1: { fontSize: 32, lineHeight: 38, letterSpacing: -0.5, ...font("800") },
  h2: { fontSize: 24, lineHeight: 30, letterSpacing: -0.3, ...font("700") },
  h3: { fontSize: 18, lineHeight: 24, ...font("600") },
  display: { fontSize: 30, lineHeight: 36, letterSpacing: -0.4, ...font("800") },
  /** Temporizador e importe grande del hero. */
  metric: { fontSize: 36, lineHeight: 44, ...font("700"), fontVariant: TABULAR_NUMS },
  metricCompact: { fontSize: 28, lineHeight: 34, ...font("700"), fontVariant: TABULAR_NUMS },
  bodyStrong: { fontSize: 16, lineHeight: 22, ...font("600") },
  body: { fontSize: 16, lineHeight: 22, ...font("400") },
  bodySmall: { fontSize: 14, lineHeight: 20, ...font("400") },
  caption: { fontSize: 13, lineHeight: 18, ...font("500") },
  micro: { fontSize: 12, lineHeight: 16, ...font("500") },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 1, ...font("700") },
  button: { fontSize: 16, lineHeight: 22, ...font("600") },
  buttonSm: { fontSize: 14, lineHeight: 20, ...font("600") },
  buttonLg: { fontSize: 18, lineHeight: 24, ...font("600") },
  /** Cifras de horas e importes en listas (14, negrita, ancho fijo). */
  figure: { fontSize: 14, lineHeight: 20, ...font("700"), fontVariant: TABULAR_NUMS },
  /** Miniatura del comprobante (documento, no UI de chrome). */
  paperKicker: { fontSize: 9, lineHeight: 12, letterSpacing: 1, ...font("800") },
  paperLabel: { fontSize: 11, lineHeight: 14, ...font("700") },
  paperValue: { fontSize: 12, lineHeight: 16, ...font("700") },
  paperLine: { fontSize: 11, lineHeight: 14, ...font("600") },
  paperTotal: { fontSize: 18, lineHeight: 22, letterSpacing: -0.5, ...font("800"), fontVariant: TABULAR_NUMS },
  paperHash: { fontSize: 14, lineHeight: 18, letterSpacing: 0.5, ...font("500") },
  /** Cifras de ancho fijo (temporizador del hero, importes): no "bailan" al avanzar. */
  tabular: { ...font("700"), fontVariant: TABULAR_NUMS },
  tabularNums: { fontVariant: TABULAR_NUMS },
};
