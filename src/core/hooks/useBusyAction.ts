/**
 * useBusyAction — anti-doble toque para emit/acciones async.
 * Mismo patrón que system/conflict.tsx: un gate síncrono, busy en pantalla
 * y try/finally para que un fallo no deje el control ocupado.
 * Si la acción lanza o devuelve { ok: false } y nadie publicó un aviso,
 * se avisa por FeedbackService (FeedbackBridge lo muestra). Un rechazo que
 * el router ya convirtió en aviso no se duplica.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackService } from "../../services/application/FeedbackService";
import { Store } from "../store";

/** Tras soltar busy, un segundo toque no escribe otro asiento. */
export const BUSY_HOLD_MS = 800;

export type BusyActionOptions = {
  /** Publica el fallo si nadie más lo hizo. Por defecto true. */
  surface?: boolean;
};

function isFailure(value: unknown): value is { ok: false; code?: string } {
  return !!value && typeof value === "object" && (value as { ok?: unknown }).ok === false;
}

function surfaceFailure(before: ReadonlySet<string>, value: unknown): void {
  const pending = Store.getState().feedback.pending;
  if (pending.some((item) => !before.has(item.id))) return;
  const code = isFailure(value) ? value.code : undefined;
  if (code && code !== "ERROR") FeedbackService.rejected(String(code));
  else FeedbackService.emit("GENERIC_ERROR");
}

export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const gate = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T> | T, options?: BusyActionOptions): Promise<T | undefined> => {
    if (gate.current) return undefined;
    gate.current = true;
    setBusy(true);
    const before = new Set(Store.getState().feedback.pending.map((item) => item.id));
    const surface = options?.surface !== false;
    try {
      const result = await action();
      if (surface && isFailure(result)) surfaceFailure(before, result);
      return result;
    } catch {
      if (surface) surfaceFailure(before, { ok: false, code: "ERROR" });
      return undefined;
    } finally {
      setBusy(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        gate.current = false;
        timer.current = null;
      }, BUSY_HOLD_MS);
    }
  }, []);

  return { busy, run };
}
