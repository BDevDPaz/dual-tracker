/**
 * legal/disclosure.tsx — Texto vigente del descargo (Producto §5.17).
 * Solo lectura. Misma fuente que el wizard (DualDisclosureService vía
 * queries); no es un duplicado en duro.
 */
import { StyleSheet, Text } from "react-native";
import { SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { DisclosureContent } from "../../src/components/legal/DisclosureContent";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { getLanguage } from "../../src/i18n";
import { formatDate } from "../../src/utils/dateUtils";

export default function LegalDisclosureScreen() {
  const { state, queries } = useWorkTracker();
  const acceptedAt = state.settings.device.disclosureAcceptedAtMs;
  return (
    <ScreenScroll edges={SAFE_EDGES.stack} keyboard={false}>
      <DisclosureContent content={queries.disclosure(getLanguage())} />
      {acceptedAt ? (
        <Text style={[styles.caption, { color: TOKENS.colors.text.muted }]}>
          ✓ {state.settings.device.disclosureAcceptedVersion} · {formatDate(acceptedAt)}
        </Text>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  caption: { ...FONT.caption, marginTop: TOKENS.spacing.md },
});
