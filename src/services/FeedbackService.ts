import * as Crypto from "expo-crypto";

import type { FeedbackPayload } from "../core/contracts";
import { timeAuthorityService } from "./TimeAuthorityService";

/**
 * ============================================================================
 * FeedbackService — Propuesta 4.7 (fusiona ToastService y el puente de logs
 * a UI)
 * ----------------------------------------------------------------------------
 * "Toasts, diálogos de decisión y microcopy aprobado (MICROCOPY) salen de
 * un diccionario versionado. El dominio emite códigos; la UI no inventa
 * texto legal."
 *
 * Sustituye la humanización de mensajes dispersa en
 * `src/feedback/logBridge.ts` (regex sobre mensajes de log) por un
 * diccionario explícito de códigos de dominio → copy es/en. La UI
 * (ToastContext, diálogos) consume `FeedbackPayload` ya resuelto; nunca
 * decide el texto por sí misma.
 * ============================================================================
 */

export type SupportedLocale = "es" | "en";

/** Diccionario versionado de microcopy. Un código, una frase por idioma. */
export const MICROCOPY_VERSION = 1;

export const MICROCOPY: Record<string, { es: string; en: string }> = {
  MUTEX_REJECTED: {
    es: "Otra acción ya está en curso sobre esta jornada. Espera un momento e inténtalo de nuevo.",
    en: "Another action is already in progress for this session. Wait a moment and try again.",
  },
  SESSION_CLOSED_CONFLICT: {
    es: "La jornada se cerró, pero quedó marcada como no certificada por un conflicto de integridad.",
    en: "The session was closed, but it was flagged as uncertified due to an integrity conflict.",
  },
  EXIT_DETECTED_PROMPT: {
    es: "Detectamos que saliste de la zona de trabajo. ¿Sigues trabajando o cerramos la jornada?",
    en: "We detected you left the work zone. Are you still working, or should we close the session?",
  },
  MANUAL_EDIT_REQUIRES_NOTE: {
    es: "Toda edición manual del horario requiere una nota de auditoría antes de guardarse.",
    en: "Every manual schedule edit requires an audit note before it can be saved.",
  },
  BACKGROUND_LOCATION_REQUIRED: {
    es: "Se necesita permiso de ubicación en segundo plano para registrar tu jornada de forma confiable.",
    en: "Background location permission is required to reliably track your work session.",
  },
  DISCLOSURE_REQUIRED: {
    es: "Antes de iniciar necesitas aceptar el aviso de qué ubicación se registra y para qué se usa.",
    en: "Before starting you need to accept the disclosure about what location is recorded and why.",
  },
  DESTINATION_LIMIT_REACHED: {
    es: "Alcanzaste el límite de destinos permitido por tu configuración. Elimina uno antes de agregar otro.",
    en: "You reached the destination limit allowed by your settings. Remove one before adding another.",
  },
  TRANSIT_DESTINATION_REQUIRED: {
    es: "Debes elegir un destino antes de iniciar el traslado.",
    en: "You must choose a destination before starting transit.",
  },
  OS_KILL_RECOVERED: {
    es: "La app se reinició de forma inesperada. Restauramos tu jornada activa sin duplicarla.",
    en: "The app restarted unexpectedly. We restored your active session without duplicating it.",
  },
  PAYROLL_RECALCULATED: {
    es: "La nómina de este periodo se recalculó por un cambio de política. El historial cerrado no se modificó.",
    en: "Payroll for this period was recalculated due to a policy change. Closed history was not modified.",
  },
};

type DispatchFn = (action: {
  type: "FEEDBACK_ENQUEUED";
  feedback: FeedbackPayload;
}) => void | Promise<void>;

class FeedbackService {
  private locale: SupportedLocale = "es";

  /** Cambia el idioma activo para futuras llamadas a emit(). */
  setLocale(locale: SupportedLocale): void {
    this.locale = locale;
  }

  getLocale(): SupportedLocale {
    return this.locale;
  }

  /**
   * Construye un FeedbackPayload a partir de un código de dominio conocido.
   * La UI solo debe llamar a esto (o consumir el payload ya emitido vía
   * dispatch), nunca componer texto legal/microcopy por su cuenta.
   */
  emit(
    code: keyof typeof MICROCOPY,
    tone: FeedbackPayload["tone"],
    opts?: {
      destructive?: boolean;
      durationMs?: number;
      kind?: FeedbackPayload["kind"];
      title?: string | null;
    },
  ): FeedbackPayload {
    const entry = MICROCOPY[code];

    const message = entry
      ? entry[this.locale]
      : this.locale === "es"
        ? `Código de mensaje desconocido: ${String(code)}`
        : `Unknown message code: ${String(code)}`;

    const id = `${timeAuthorityService.now()}-${Crypto.randomUUID()}`;

    return {
      id,
      kind: opts?.kind ?? "toast",
      tone,
      title: opts?.title ?? null,
      message,
      dedupeKey: String(code),
      durationMs: opts?.durationMs ?? (opts?.kind === "dialog" ? null : 3200),
      destructive: opts?.destructive ?? false,
    };
  }

  /**
   * CORREGIDO 2026-10-29: helper sin import circular.
   * Construye el payload con emit() y lo despacha al engine para que
   * useLogFeedback lo muestre vía ToastContext.
   * Pasa dispatch desde el caller: workTrackerEngine.dispatch
   */
  emitAndEnqueue(
    dispatch: DispatchFn,
    code: keyof typeof MICROCOPY,
    tone: FeedbackPayload["tone"],
    opts?: {
      destructive?: boolean;
      durationMs?: number;
      kind?: FeedbackPayload["kind"];
      title?: string | null;
    },
  ): FeedbackPayload {
    const payload = this.emit(code, tone, opts);
    void dispatch({ type: "FEEDBACK_ENQUEUED", feedback: payload });
    return payload;
  }
}

export const feedbackService = new FeedbackService();
