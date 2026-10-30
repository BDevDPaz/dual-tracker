/**
 * Dual Tracker Visual System 2.0 — Obsidian & Porcelain
 * Guía de estilos nueva: Dark Mode + Light Mode, ES/EN ready.
 *
 * Basada en la arquitectura de "Dual Tracker: Guía de Comandos Esenciales y Especializados"
 * y en la estructura real de DualTracker_ServiceLayer:
 *  - app/(tabs): Hoy, Historial, Reportes, Ajustes
 *  - app/sites, app/session, app/report, app/legal, app/system
 *  - src/components/ui/* + src/components/modals/*
 *
 * Uso:
 *   import { useTheme } from "../context/ThemeContext";
 *   const { tokens, mode } = useTheme();
 */

export type ThemeMode = "dark" | "light";

/* ── Primitivos de marca (no usar directo en UI, usar tokens) ── */
export const BRAND = {
  gold: "#D4AF37",
  goldDeep: "#B8962E",
  goldInk: "#8F6E0B", // dorado accesible sobre claro
  obsidian: "#0D0D0D",
  porcelain: "#F9F8F4",
} as const;

/* ── Paletas crudas ── */
export const DARK_PALETTE = {
  background: "#0D0D0D",
  backgroundSoft: "#121214",
  surface: "#161619",
  surfaceElevated: "#1E1E22",
  border: "#2A2A2E",
  borderSubtle: "#1F1F23",
  textPrimary: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted: "#6E6E78",
  textInverse: "#0D0D0D",
  primary: "#D4AF37",
  primaryPressed: "#B8962E",
  primarySoft: "rgba(212,175,55,0.14)",
  success: "#2EBD6B",
  successSoft: "rgba(46,189,107,0.14)",
  warning: "#F2994A",
  warningSoft: "rgba(242,153,74,0.14)",
  danger: "#EB5757",
  dangerSoft: "rgba(235,87,87,0.14)",
  info: "#6B8AF4",
  infoSoft: "rgba(107,138,244,0.14)",
  overlay: "rgba(0,0,0,0.6)",
  tabBar: "#0D0D0D",
} as const;

export const LIGHT_PALETTE = {
  background: "#F9F8F4",
  backgroundSoft: "#F0EEE7",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  border: "#E7E0D1",
  borderSubtle: "#EFE9DB",
  textPrimary: "#141412",
  textSecondary: "#5D5B54",
  textMuted: "#9B988D",
  textInverse: "#FFFFFF",
  primary: "#8F6E0B", // contraste AA sobre blanco
  primaryPressed: "#7A5E09",
  primarySoft: "rgba(212,175,55,0.18)",
  success: "#1B7F44",
  successSoft: "rgba(27,127,68,0.12)",
  warning: "#B25E09",
  warningSoft: "rgba(178,94,9,0.12)",
  danger: "#C93A3A",
  dangerSoft: "rgba(201,58,58,0.10)",
  info: "#3A5BD9",
  infoSoft: "rgba(58,91,217,0.10)",
  overlay: "rgba(20,18,8,0.45)",
  tabBar: "#FFFFFF",
} as const;

/* ── Tokens compartidos ── */
const spacing = {
  zero: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
} as const;

const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  round: 9999,
} as const;

const layout = {
  screenPadding: 20,
  sectionGap: 28,
  cardPadding: 16,
  minTouchTarget: 44,
  maxContentWidth: 480,
} as const;

const shadowsDark = {
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
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

const shadowsLight = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: "#3A2F0B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#3A2F0B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "#3A2F0B",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;

export const FONT_FAMILY = {
  regular: "Montserrat_400Regular",
  medium: "Montserrat_500Medium",
  semiBold: "Montserrat_600SemiBold",
  bold: "Montserrat_700Bold",
  extraBold: "Montserrat_800ExtraBold",
} as const;

export const FONT = {
  h1: {
    fontSize: 30,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
    lineHeight: 36,
    fontFamily: FONT_FAMILY.extraBold,
  },
  h2: {
    fontSize: 22,
    fontWeight: "700" as const,
    letterSpacing: -0.2,
    lineHeight: 28,
    fontFamily: FONT_FAMILY.bold,
  },
  h3: {
    fontSize: 17,
    fontWeight: "600" as const,
    lineHeight: 22,
    fontFamily: FONT_FAMILY.semiBold,
  },
  bodyStrong: {
    fontSize: 15,
    fontWeight: "600" as const,
    lineHeight: 22,
    fontFamily: FONT_FAMILY.semiBold,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 22,
    fontFamily: FONT_FAMILY.regular,
  },
  caption: {
    fontSize: 13,
    fontWeight: "500" as const,
    lineHeight: 18,
    fontFamily: FONT_FAMILY.medium,
  },
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    lineHeight: 14,
    fontFamily: FONT_FAMILY.bold,
  },
} as const;

export const MOTION = {
  pressedScale: 0.97,
  disabledOpacity: 0.45,
  modalEnter: "slide-up-fade",
  durationFast: 150,
  durationMed: 250,
} as const;

function buildTokens(mode: ThemeMode) {
  const c = mode === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  return {
    mode,
    colors: {
      background: c.background,
      backgroundSoft: c.backgroundSoft,
      surface: c.surface,
      surfaceElevated: c.surfaceElevated,
      primary: c.primary,
      primaryPressed: c.primaryPressed,
      primarySoft: c.primarySoft,
      border: c.border,
      borderSubtle: c.borderSubtle,
      text: {
        primary: c.textPrimary,
        secondary: c.textSecondary,
        muted: c.textMuted,
        inverse: c.textInverse,
      },
      status: {
        success: c.success,
        warning: c.warning,
        danger: c.danger,
        info: c.info,
      },
      statusSoft: {
        success: c.successSoft,
        warning: c.warningSoft,
        danger: c.dangerSoft,
        info: c.infoSoft,
      },
      overlay: c.overlay,
      tabBar: c.tabBar,
    },
    spacing,
    radius,
    layout,
    shadows: mode === "dark" ? shadowsDark : shadowsLight,
    zIndex: { base: 0, dropdown: 1000, sticky: 1100, modal: 2000, toast: 3000, overlay: 4000 },
  };
}

export const TOKENS_DARK = buildTokens("dark");
export const TOKENS_LIGHT = buildTokens("light");

/* Compatibilidad hacia atrás: TOKENS = dark (sistema actual) */
export const TOKENS = TOKENS_DARK;
export const PALETTE = {
  obsidian: DARK_PALETTE.background,
  graphite: DARK_PALETTE.backgroundSoft,
  carbonMist: DARK_PALETTE.surfaceElevated,
  steelLine: DARK_PALETTE.border,
  textPrimary: DARK_PALETTE.textPrimary,
  textSecondary: DARK_PALETTE.textSecondary,
  textMuted: DARK_PALETTE.textMuted,
  mutedGold: BRAND.gold,
  successGreen: DARK_PALETTE.success,
  amberWarning: DARK_PALETTE.warning,
  deepRed: DARK_PALETTE.danger,
  slateBlue: DARK_PALETTE.info,
};

export const RADIUS = { round: radius.round, cards: radius.lg, inputs: radius.md };
export const SPACING = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing["2xl"],
};

export type AppTokens = ReturnType<typeof buildTokens>;
export const getTokens = (mode: ThemeMode) => (mode === "dark" ? TOKENS_DARK : TOKENS_LIGHT);
