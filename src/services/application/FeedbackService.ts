/**
 * FeedbackService — Aplicación (Propuesta Técnica §5.14, fusiona logBridge + i18n + Toast)
 * ============================================================================
 * Traduce eventos técnicos a lenguaje de usuario sin filtrar jerga.
 *  - Diccionario MICROCOPY versionado (src/i18n/microcopy.ts); nunca se muestran
 *    códigos crudos como "Mutex failed" (vienen de logBridge de GEOTrack).
 *  - Toast efímero vs. diálogo persistente según gravedad.
 *  - Mismo mensaje en ES/EN; si falta la traducción, cae a ES.
 *
 * Publica en el store (feedback.pending); el puente de UI
 * (src/components/feedback/FeedbackBridge.tsx) lo muestra con ToastContext.
 */
import type { FeedbackCode, FeedbackPayload, FeedbackTone } from "../../core/contracts";
import { Store, StoreActions } from "../../core/store";
import { MICROCOPY, MICROCOPY_REJECTIONS, MICROCOPY_VERSION } from "../../i18n/microcopy";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";

let seq = 0;

export const FeedbackService = {
  version: MICROCOPY_VERSION,

  /** Emite un aviso. `kind`/`tone` salen del diccionario salvo que se fuercen. */
  emit(
    code: FeedbackCode,
    params: Record<string, string | number> = {},
    override: { kind?: FeedbackPayload["kind"]; tone?: FeedbackTone } = {},
  ): FeedbackPayload {
    const entry = MICROCOPY[code];
    const payload: FeedbackPayload = {
      id: `fb-${TimeAuthorityService.now()}-${++seq}`,
      code,
      kind: override.kind ?? entry.kind,
      tone: override.tone ?? entry.tone,
      params,
      createdAtMs: TimeAuthorityService.now(),
    };
    StoreActions.feedbackPushed(payload);
    return payload;
  },

  /** Rechazo de intención → aviso de usuario (el código técnico va en params, no en el texto). */
  rejected(code: string): FeedbackPayload {
    return FeedbackService.emit("INTENT_REJECTED", { reason: code });
  },

  dismiss(id: string): void {
    StoreActions.feedbackDismissed(id);
  },

  pending(): FeedbackPayload[] {
    return Store.getState().feedback.pending;
  },

  /** Texto final para un payload (lo usa el puente de UI). */
  render(payload: FeedbackPayload, language: "es" | "en"): { title: string; message: string } {
    const entry = MICROCOPY[payload.code];
    const tpl = entry[language] ?? entry.es;
    const fill = (s: string) =>
      s.replace(/\{(\w+)\}/g, (_m, k: string) => {
        if (k === "reason") return renderReason(String(payload.params.reason ?? ""), language);
        return String(payload.params[k] ?? "");
      });
    return { title: fill(tpl.title), message: fill(tpl.message) };
  },
};

function renderReason(code: string, language: "es" | "en"): string {
  const dict = MICROCOPY_REJECTIONS[language] ?? MICROCOPY_REJECTIONS.es;
  return dict[code] ?? MICROCOPY_REJECTIONS.es[code] ?? (language === "en" ? "Action not available now." : "Acción no disponible ahora.");
}

