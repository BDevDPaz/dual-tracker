/**
 * Feedback codificado (FeedbackService, Propuesta Técnica §4.7):
 * "El dominio emite códigos; la UI no inventa texto legal."
 */
export type FeedbackTone = "success" | "error" | "info" | "warning";

export type FeedbackCode =
  | "DAY_STARTED"
  | "DAY_CANCELLED"
  | "ARRIVAL_CONFIRMED"
  | "AUTO_CHECKIN"
  | "LUNCH_STARTED"
  | "RESUMED"
  | "TRANSFER_STARTED"
  | "TRANSFER_CANCELLED"
  | "EXIT_DETECTED"
  | "STAY_WORKING"
  | "DAY_CLOSED"
  | "DAY_AUTO_CLOSED"
  | "SESSION_PATCHED"
  | "SESSION_DELETED"
  | "NOTE_SAVED"
  | "CONFLICT_RESOLVED"
  | "OS_KILL_RECOVERED"
  | "PERMISSION_REVOKED"
  | "CLOCK_DRIFT"
  | "SITE_SAVED"
  | "SITE_ARCHIVED"
  | "PACK_SEALED"
  | "PACK_REUSED"
  | "SETTINGS_SAVED"
  | "ADMIN_UNLOCKED"
  | "ADMIN_LOCKED"
  | "ADMIN_DENIED"
  | "ADMIN_LOCKOUT"
  | "ADMIN_PIN_SET"
  | "DISCLOSURE_ACCEPTED"
  | "INTENT_REJECTED"
  | "GENERIC_ERROR";

export interface FeedbackPayload {
  id: string;
  code: FeedbackCode;
  kind: "toast" | "dialog";
  tone: FeedbackTone;
  /** Parámetros para interpolar el microcopy (nunca texto libre). */
  params: Record<string, string | number>;
  createdAtMs: number;
}
