import { useEffect, useRef } from "react";
import { useWorkTracker } from "../core/hooks";
import { selectPendingFeedback } from "../core/selectors";
import { useToast } from "../context/ToastContext";

export const useLogFeedback = () => {
  const { state, dispatch } = useWorkTracker();
  const pending = selectPendingFeedback(state);
  const { showToast } = useToast();
  const processedIds = useRef(new Set<string>());

  useEffect(() => {
    if (pending.length === 0) return;

    pending.forEach((feedback) => {
      if (processedIds.current.has(feedback.id)) return;

      // showToast solo acepta message y type opcional en su firma actual
      showToast(feedback.message, feedback.tone);

      processedIds.current.add(feedback.id);
      dispatch({ type: "FEEDBACK_DISMISSED", feedbackId: feedback.id });
    });
  }, [pending, showToast, dispatch]);
};
