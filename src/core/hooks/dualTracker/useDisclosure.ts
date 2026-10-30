import { useCallback, useMemo } from "react";
import { dualDisclosureService } from "../../../services/DualDisclosureService";
import type { DisclosureText } from "../../../services/DualDisclosureService";
import type { TraceMode } from "../../contracts/domain";

/**
 * useDisclosure — descargo legal (app/(onboarding)/disclosure.tsx y
 * app/legal/disclosure.tsx en modo lectura). El contenido lo sirve
 * DualDisclosureService en ambos lugares para no divergir del wizard
 * (Propuesta capa app §5.17).
 */
export function useDisclosure(locale: "es" | "en" = "es") {
  const text: DisclosureText = useMemo(
    () => dualDisclosureService.getDisclosureText(locale),
    [locale],
  );

  const retentionText: DisclosureText = useMemo(
    () => dualDisclosureService.getRetentionText(locale),
    [locale],
  );

  const canStartWaiting = useCallback(
    (disclaimerAccepted: boolean) => dualDisclosureService.canStartWaitingState(disclaimerAccepted),
    [],
  );

  const traceMode = useCallback(
    (input: {
      disclaimerAccepted: boolean;
      hasBackgroundLocation: boolean;
      hasForegroundLocation: boolean;
    }): TraceMode => dualDisclosureService.getTraceMode(input),
    [],
  );

  return { text, retentionText, canStartWaiting, traceMode };
}
