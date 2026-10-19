import { useEffect, useState } from "react";
import {
  dispatchPractice,
  enterPractice,
  exitPractice,
  getPracticeSnapshot,
  subscribePractice,
  type PracticeAction,
  type PracticeSnapshot,
} from "../../support/practice";

/** Suscripción al simulador. No lee ni escribe el store real. */
export function usePractice(): {
  ready: boolean;
  snapshot: PracticeSnapshot;
  enter: () => Promise<PracticeSnapshot>;
  exit: () => Promise<void>;
  dispatch: typeof dispatchPractice;
} {
  const [snapshot, setSnapshot] = useState<PracticeSnapshot>(getPracticeSnapshot());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    return subscribePractice(() => setSnapshot(getPracticeSnapshot()));
  }, []);
  return { ready, snapshot, enter: enterPractice, exit: exitPractice, dispatch: dispatchPractice };
}

export type { PracticeAction };
