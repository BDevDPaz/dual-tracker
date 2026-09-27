/**
 * Registro de modales BLOQUEANTES visibles (ModalShell con dismissible={false}).
 * Lo consultan FeedbackBridge (no abre un segundo diálogo encima de
 * ExitDetectionModal) y ToastContext (no tapa una decisión con un toast).
 * Estado de UI puro: no toca dominio ni store.
 */
import { useSyncExternalStore } from "react";

const visible = new Set<string>();
const listeners = new Set<() => void>();
let snapshot = 0;

function notify(): void {
  snapshot = visible.size;
  for (const l of listeners) l();
}

export const BlockingModals = {
  show(id: string): void {
    if (visible.has(id)) return;
    visible.add(id);
    notify();
  },
  hide(id: string): void {
    if (!visible.delete(id)) return;
    notify();
  },
  count(): number {
    return visible.size;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Solo tests. */
  __reset(): void {
    visible.clear();
    notify();
  },
};

/** true mientras haya al menos un modal bloqueante en pantalla. */
export function useBlockingModalVisible(): boolean {
  return useSyncExternalStore(BlockingModals.subscribe, () => snapshot, () => 0) > 0;
}
