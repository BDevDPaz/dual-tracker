/**
 * legal/retention.tsx — Política de retención (Producto §5.17).
 * Explica cuánto se guarda la miga de pan y cuándo se expurga, según
 * CompanyPolicy.traceRetentionDays. Contenido servido por DualDisclosureService.
 * El expurgo exige las dos condiciones: periodo exportado y días cumplidos
 * (docs/CONFIABILIDAD_TANDA1.md).
 */
import { DisclosureContent } from "../../src/components/legal/DisclosureContent";
import { SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { useWorkTracker } from "../../src/core/hooks";
import { getLanguage } from "../../src/i18n";

export default function LegalRetentionScreen() {
  const { state, queries } = useWorkTracker();
  return (
    <ScreenScroll edges={SAFE_EDGES.stack} keyboard={false}>
      <DisclosureContent content={queries.retention(getLanguage(), state.settings.company.traceRetentionDays)} />
    </ScreenScroll>
  );
}
