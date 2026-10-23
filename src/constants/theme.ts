/**
 * THEME TOKENS — W Tracker «Control diario», sobre el cristal oscuro.
 * Fondo #0A0A0C, tarjetas #121214, campos y secundarios #1A1A1C,
 * divisores #33343A, oro #D4AF37. Montserrat 400/500/600.
 */

import { Platform } from "react-native";

export type ColorScheme = "dark" | "light";
/** Preferencia persistida en profile.theme. */
export type ThemePreference = "system" | "dark" | "light";

/** Paleta oscura (por defecto, userInterfaceStyle "dark"). */
export const PALETTE_DARK = {
  obsidian: "#0A0A0C", // Fondo
  graphite: "#121214", // Tarjetas
  carbonMist: "#1A1A1C", // Campos y botón secundario
  steelLine: "#1F1F22", // Borde 1 px
  divider: "#33343A",
  textPrimary: "#FFFFFF",
  textSecondary: "#9A9AA0",
  textMuted: "#6B6B72",
  mutedGold: "#D4AF37", // Acción primaria, selección y dinero
  successGreen: "#27AE60",
  amberWarning: "#F2994A",
  deepRed: "#EB5757",
  slateBlue: "#2F80ED",
};

/**
 * Alto contraste: mismo oro, texto y bordes más claros sobre negro.
 * No sustituye a theme (system | dark | light); es una capa aparte.
 */
export const PALETTE_CONTRAST: typeof PALETTE_DARK = {
  obsidian: "#000000",
  graphite: "#0A0A0A",
  carbonMist: "#121212",
  steelLine: "#FFFFFF",
  divider: "#FFFFFF",
  textPrimary: "#FFFFFF",
  textSecondary: "#F2F2F2",
  textMuted: "#D0D0D0",
  mutedGold: "#D4AF37",
  successGreen: "#3DDC97",
  amberWarning: "#FFC14D",
  deepRed: "#FF6B6B",
  slateBlue: "#9AD7FF",
};

/** Paleta clara ("papel"): preparada y cableada en primitivas; el selector sigue oculto. */
export const PALETTE_LIGHT: typeof PALETTE_DARK = {
  obsidian: "#F4F1EA", // paper
  graphite: "#ECE7DC",
  carbonMist: "#FBF9F4",
  steelLine: "#D6CFC1",
  divider: "#C8C0B2",
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
    /** Campos y botón secundario (#1A1A1C en oscuro). */
    input: p.carbonMist,
    divider: p.divider,
    focusRing: withAlpha(p.mutedGold, 0.4),
    overlay: scheme === "dark" ? "rgba(0, 0, 0, 0.65)" : "rgba(26, 23, 20, 0.35)",
    /** Cristal (hero y modales): la tarjeta sólida se lee debajo del desenfoque. */
    glass: {
      fill: scheme === "dark" ? "rgba(18, 18, 20, 0.92)" : "rgba(255, 255, 255, 0.72)",
      hairline: p.steelLine,
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

/** Capa de alto contraste (esquema de barra de estado sigue siendo oscuro). */
export const CONTRAST_COLORS: ThemeColors = buildColors(PALETTE_CONTRAST, "dark");

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
  /** Icono editorial del estado vacío. */
  empty: 56,
} as const;

export const TOKENS = {
  /** Estático = oscuro. Las primitivas leen useTheme().colors. */
  colors: COLORS.dark,
  spacing: {
    zero: 0,
    /** Medio paso de la escala de 8. */
    xxs: 4,
    xs: 8,
    sm: 8,
    md: 16,
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
    /** Banner. */
    md: 12,
    /** Botón (10) y pastilla de estado (6). */
    button: 10,
    badge: 6,
    /** Tarjeta. */
    lg: 16,
    xl: 24,
    "2xl": 32,
    /** Pastillas. */
    pill: 999,
    round: 9999,
  },
  layout: {
    /** Teléfono normal, plegable y tablet. */
    screenPadding: 20,
    /** Teléfono estrecho (< 360 dp): un paso de la escala de 8. */
    screenPaddingCompact: 16,
    sectionGap: 24,
    cardPadding: 16,
    /** Objetivo táctil mínimo (48 dp). Botones, chips, iconos de cierre y filas pulsables. */
    minTouchTarget: 48,
    /** Acción primaria. */
    buttonPrimary: 52,
    buttonMd: 52,
    buttonLg: 56,
    /** Punto de jornada activa en la pestaña Hoy. */
    dot: 8,
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

export type FontWeight = "400" | "500" | "600";

/** Familias de @expo-google-fonts/montserrat cargadas con useFonts en app/_layout.tsx. */
export const FONT_FAMILY: Record<FontWeight, string> = {
  "400": "Montserrat_400Regular",
  "500": "Montserrat_500Medium",
  "600": "Montserrat_600SemiBold",
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
  /** Títulos de pantalla, 26–28, interlineado 1.4–1.5, peso 600. */
  h1: { fontSize: 28, lineHeight: 42, letterSpacing: -0.4, ...font("600") },
  h2: { fontSize: 26, lineHeight: 38, letterSpacing: -0.3, ...font("600") },
  h3: { fontSize: 18, lineHeight: 26, ...font("600") },
  display: { fontSize: 28, lineHeight: 42, letterSpacing: -0.4, ...font("600") },
  /** Cronómetro del hero (40, tabular). */
  timer: { fontSize: 40, lineHeight: 48, ...font("600"), fontVariant: TABULAR_NUMS },
  /** Título de tarjeta 15/600. */
  cardTitle: { fontSize: 15, lineHeight: 22, ...font("600") },
  /** Subtítulo de tarjeta en mayúsculas. */
  kicker: { fontSize: 10, lineHeight: 14, letterSpacing: 1.5, ...font("600") },
  /** Texto de badge 10/600. */
  badge: { fontSize: 10, lineHeight: 14, letterSpacing: 1, ...font("600") },
  /** Cifras grandes (22–28) de tiempo y dinero. */
  metric: { fontSize: 28, lineHeight: 40, ...font("600"), fontVariant: TABULAR_NUMS },
  metricCompact: { fontSize: 22, lineHeight: 32, ...font("600"), fontVariant: TABULAR_NUMS },
  bodyStrong: { fontSize: 16, lineHeight: 24, ...font("600") },
  body: { fontSize: 16, lineHeight: 24, ...font("400") },
  bodySmall: { fontSize: 14, lineHeight: 21, ...font("400") },
  /** Metadatos 13–14. */
  caption: { fontSize: 13, lineHeight: 19, ...font("500") },
  micro: { fontSize: 13, lineHeight: 19, ...font("500") },
  label: { fontSize: 13, lineHeight: 19, letterSpacing: 0.6, ...font("600") },
  button: { fontSize: 16, lineHeight: 24, ...font("600") },
  buttonSm: { fontSize: 14, lineHeight: 20, ...font("600") },
  buttonLg: { fontSize: 16, lineHeight: 24, ...font("600") },
  /** Horas e importes en listas (22, tabular). */
  figure: { fontSize: 22, lineHeight: 32, ...font("600"), fontVariant: TABULAR_NUMS },
  /**
   * Miniatura del comprobante en pantalla. El PDF no usa estas familias:
   * el HTML del recibo vive en reportTemplates y no se toca aquí.
   */
  paperKicker: { fontSize: 9, lineHeight: 12, letterSpacing: 1, ...font("600") },
  paperLabel: { fontSize: 11, lineHeight: 14, ...font("600") },
  paperValue: { fontSize: 12, lineHeight: 16, ...font("600") },
  paperLine: { fontSize: 11, lineHeight: 14, ...font("600") },
  paperTotal: { fontSize: 18, lineHeight: 22, letterSpacing: -0.5, ...font("600"), fontVariant: TABULAR_NUMS },
  paperHash: { fontSize: 14, lineHeight: 18, letterSpacing: 0.5, ...font("500") },
  /** Cifras de ancho fijo (temporizador, importes): no "bailan" al avanzar. */
  tabular: { ...font("600"), fontVariant: TABULAR_NUMS },
  tabularNums: { fontVariant: TABULAR_NUMS },
};
