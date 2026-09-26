/**
 * legal/retention.tsx — Política de retención (Producto §5.17).
 * Explica cuánto se guarda la miga de pan y cuándo se expurga, según
 * CompanyPolicy.traceRetentionDays. Contenido servido por DualDisclosureService.
 * TODO(propuesta): la variante "fin de periodo exportado" aún no se aplica en
 * TraceRecorderService.purgeExpired (solo días).
 */
import { ScrollView, StyleSheet } from "react-native";
import { DisclosureContent } from "../../src/components/legal/DisclosureContent";
import { TOKENS } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { getLanguage } from "../../src/i18n";

export default function LegalRetentionScreen() {
  const { state, queries } = useWorkTracker();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DisclosureContent content={queries.retention(getLanguage(), state.settings.company.traceRetentionDays)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.xl },
});
