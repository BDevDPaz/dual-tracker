import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useToast } from "../../context/ToastContext";
import { useWorkTracker } from "../../core/hooks";
import { selectPendingFeedback } from "../../core/selectors";
import { getLanguage } from "../../i18n";

/**
 * FeedbackBridge — puente FeedbackService → UI (sustituye useLogFeedback /
 * logBridge de GEOTrack). Toast efímero vs. diálogo persistente según el
 * `kind` que fija el diccionario MICROCOPY. No inventa texto: lo renderiza
 * FeedbackService.render.
 */
export function FeedbackBridge() {
  const { state, emit, queries } = useWorkTracker();
  const { showToast } = useToast();
  const shown = useRef(new Set<string>());
  const pending = selectPendingFeedback(state);

  useEffect(() => {
    for (const fb of pending) {
      if (shown.current.has(fb.id)) continue;
      shown.current.add(fb.id);
      const { title, message } = queries.renderFeedback(fb, getLanguage());
      if (fb.kind === "dialog") {
        Alert.alert(title, message || undefined, [{ text: "OK", onPress: () => emit({ type: "DISMISS_FEEDBACK", feedbackId: fb.id }) }]);
      } else {
        showToast(message ? `${title} · ${message}` : title, fb.tone);
        emit({ type: "DISMISS_FEEDBACK", feedbackId: fb.id });
      }
    }
  }, [pending, emit, queries, showToast]);

  return null;
}
