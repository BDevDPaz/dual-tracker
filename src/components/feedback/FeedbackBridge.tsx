import { useEffect, useRef, useState } from "react";
import { useToast, type ToastMark } from "../../context/ToastContext";
import type { FeedbackCode, FeedbackPayload, FeedbackTone } from "../../core/contracts";
import { useWorkTracker } from "../../core/hooks";
import { selectPendingFeedback } from "../../core/selectors";
import { t, useLanguage, type Language } from "../../i18n";
import { ModalShell, type ModalTone } from "../ui/ModalShell";
import { useBlockingModalVisible } from "./blockingModals";
import { markCriticalFeedbackShown } from "../../services/runtime/criticalNotices";

/**
 * FeedbackBridge — puente FeedbackService → UI (sustituye useLogFeedback /
 * logBridge de GEOTrack). Toast efímero vs. diálogo persistente según el
 * `kind` que fija el diccionario MICROCOPY. No inventa texto: lo renderiza
 * FeedbackService.render.
 *
 * Diálogos: ModalShell con el tono del aviso (nunca Alert.alert). Uno cada vez,
 * en cola, y nunca encima de un modal bloqueante que ya decide lo mismo
 * (ExitDetectionModal). Los avisos de integridad/permiso son NO descartables:
 * solo se cierran con el botón explícito.
 */

/** La pantalla ya tiene un modal propio para estos códigos: nunca un segundo diálogo. */
export const SCREEN_OWNED_DIALOGS: ReadonlySet<FeedbackCode> = new Set<FeedbackCode>(["EXIT_DETECTED"]);

/** Diálogos de integridad/permiso: sin X, sin toque en el fondo, sin botón atrás. */
export const BLOCKING_DIALOGS: ReadonlySet<FeedbackCode> = new Set<FeedbackCode>([
  "PERMISSION_REVOKED",
  "CLOCK_DRIFT",
  "LEDGER_BROKEN",
  "FIELD_CRYPTO_KEY_LOST",
]);

/** Llegada confirmada a mano y check-in automático: el símbolo es el concepto D. */
const ARRIVAL_MARK: ReadonlySet<FeedbackCode> = new Set<FeedbackCode>(["ARRIVAL_CONFIRMED", "AUTO_CHECKIN"]);

const MODAL_TONE: Record<FeedbackTone, ModalTone> = {
  success: "success",
  info: "info",
  warning: "warning",
  error: "danger",
};

export function FeedbackBridge() {
  const language = useLanguage();
  const { state, emit, queries } = useWorkTracker();
  const { showToast } = useToast();
  const blockingVisible = useBlockingModalVisible();
  const shown = useRef(new Set<string>());
  const [queue, setQueue] = useState<FeedbackPayload[]>([]);
  const [current, setCurrent] = useState<FeedbackPayload | null>(null);
  const pending = selectPendingFeedback(state);

  useEffect(() => {
    const dialogs: FeedbackPayload[] = [];
    for (const fb of pending) {
      if (shown.current.has(fb.id)) continue;
      shown.current.add(fb.id);
      if (fb.kind === "dialog" && !SCREEN_OWNED_DIALOGS.has(fb.code)) {
        dialogs.push(fb);
        continue;
      }
      // Toast (o diálogo cuyo modal ya pinta la pantalla → aviso corto, no un segundo diálogo).
      const { title, message } = queries.renderFeedback(fb, language);
      const live = (lang: Language) => {
        const rendered = queries.renderFeedback(fb, lang);
        return { title: rendered.title, caption: rendered.message || undefined };
      };
      const mark: ToastMark | undefined = ARRIVAL_MARK.has(fb.code) ? "arrival" : undefined;
      showToast(title, fb.tone, message || undefined, live, mark);
      markCriticalFeedbackShown(fb.code, state.sessions.activeSessionId, false);
      void emit({ type: "DISMISS_FEEDBACK", feedbackId: fb.id });
    }
    if (dialogs.length) setQueue((q) => [...q, ...dialogs]);
  }, [pending, emit, queries, showToast, language, state.sessions.activeSessionId]);

  // Siguiente diálogo solo cuando no hay otro en pantalla ni un modal bloqueante ajeno.
  useEffect(() => {
    if (current || queue.length === 0 || blockingVisible) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
  }, [current, queue, blockingVisible]);

  if (!current) return null;
  const { title, message } = queries.renderFeedback(current, language);
  const dismiss = () => {
    const id = current.id;
    const code = current.code;
    markCriticalFeedbackShown(code, state.sessions.activeSessionId, true);
    setCurrent(null);
    void emit({ type: "DISMISS_FEEDBACK", feedbackId: id });
  };
  return (
    <ModalShell
      visible
      testID="feedback-dialog"
      title={title}
      description={message || undefined}
      tone={MODAL_TONE[current.tone]}
      dismissible={!BLOCKING_DIALOGS.has(current.code)}
      onClose={dismiss}
      primaryAction={{ label: t("common.ok"), onPress: dismiss, variant: current.tone === "error" ? "primary" : undefined }}
    />
  );
}
