import Svg, { Circle, Path } from "react-native-svg";
import { ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { PIN_CLOCK_HANDS, PIN_CLOCK_PIN } from "./paths";

type PinClockMarkProps = {
  /** Lado en dp. Por defecto ICON.xl. */
  size?: number;
  /** Trazo del pin y centro. Por defecto el acento del tema. */
  color?: string;
  /** Manecillas. Por defecto el texto principal del tema. */
  handColor?: string;
  /** Sin anuncio propio: el texto de al lado ya nombra la marca. */
  decorative?: boolean;
  testID?: string;
};

/**
 * Concepto A · Pin-Reloj, sin el fondo del icono. Sirve en cabeceras
 * (Soporte, alta). El acento y las manecillas siguen la paleta activa
 * salvo que se pasen colores (la barra nativa de Soporte es siempre oscura).
 */
export function PinClockMark({ size = ICON.xl, color, handColor, decorative = false, testID = "pin-clock-mark" }: PinClockMarkProps) {
  useLanguage();
  const { colors } = useTheme();
  const pin = color ?? colors.primary;
  const hands = handColor ?? colors.text.primary;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={decorative ? undefined : t("a11y.brandMark")}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
    >
      <Path d={PIN_CLOCK_PIN} fill="none" stroke={pin} strokeWidth={56} strokeLinejoin="round" />
      <Path d={PIN_CLOCK_HANDS} fill="none" stroke={hands} strokeWidth={44} strokeLinecap="round" />
      <Circle cx={512} cy={440} r={30} fill={pin} />
    </Svg>
  );
}
