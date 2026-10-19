import { useId } from "react";
import Svg, { Defs, Mask, Path, Rect } from "react-native-svg";
import { ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { ARRIVAL_CHECK, ARRIVAL_LINE, ARRIVAL_PIN } from "./paths";

type ArrivalMarkProps = {
  /** Lado en dp. Por defecto ICON.xl. */
  size?: number;
  /** Relleno del pin. Por defecto el acento del tema. */
  color?: string;
  /** Línea bajo el pin. Por defecto el texto secundario. */
  lineColor?: string;
  /** Sin anuncio propio: la pastilla o el aviso ya dicen el estado. */
  decorative?: boolean;
  testID?: string;
};

/**
 * Concepto D · Llegada confirmada. El check es un recorte: se ve el fondo
 * de la pastilla, el aviso o la línea de tiempo. El pin usa el acento
 * (mutedGold en oscuro, gold en claro) y la línea el texto secundario.
 */
export function ArrivalMark({
  size = ICON.xl,
  color,
  lineColor,
  decorative = false,
  testID = "arrival-mark",
}: ArrivalMarkProps) {
  useLanguage();
  const { colors } = useTheme();
  const pin = color ?? colors.primary;
  const line = lineColor ?? colors.text.secondary;
  const maskId = `dt-arrival-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={decorative ? undefined : t("a11y.arrivalConfirmed")}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
    >
      <Defs>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={1024} height={1024}>
          <Rect width={1024} height={1024} fill="#fff" />
          <Path d={ARRIVAL_CHECK} fill="none" stroke="#000" strokeWidth={60} strokeLinecap="round" strokeLinejoin="round" />
        </Mask>
      </Defs>
      <Path d={ARRIVAL_PIN} fill={pin} stroke={pin} strokeWidth={24} strokeLinejoin="round" mask={`url(#${maskId})`} />
      <Path d={ARRIVAL_LINE} stroke={line} strokeWidth={40} strokeLinecap="round" />
    </Svg>
  );
}
