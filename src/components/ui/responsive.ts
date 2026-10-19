import { useWindowDimensions } from "react-native";
import {
  BREAKPOINTS,
  TOKENS,
  breakpointFor,
  contentMaxWidthFor,
  isLandscape,
  screenPaddingFor,
  type BreakpointName,
} from "../../constants/theme";

export interface ResponsiveMetrics {
  width: number;
  height: number;
  fontScale: number;
  breakpoint: BreakpointName;
  landscape: boolean;
  /** true por debajo de 360 dp (CTAs apilados, padding menor). */
  isCompact: boolean;
  screenPadding: number;
  /** undefined = el contenido usa todo el ancho útil. */
  contentMaxWidth: number | undefined;
}

export function useResponsive(): ResponsiveMetrics {
  const { width, height, fontScale } = useWindowDimensions();
  const breakpoint = breakpointFor(width);
  return {
    width,
    height,
    fontScale,
    breakpoint,
    landscape: isLandscape(width, height),
    isCompact: width < BREAKPOINTS.compact,
    screenPadding: screenPaddingFor(width),
    contentMaxWidth: contentMaxWidthFor(width, height),
  };
}

export { BREAKPOINTS, TOKENS };
