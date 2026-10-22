/**
 * Auditoría de avisos críticos (llegada, salida, ubicación simulada,
 * monitoreo detenido, recuperación fallida).
 *
 * Android no confirma que una notificación se haya pintado en la barra.
 * `displayConfirmed` queda en false. `acceptedByOs` solo dice si el sistema
 * aceptó programarla. Un toque del operario es otra cosa: eso sí se anota
 * como userAcknowledged. No cambia la jornada ni el pago.
 */
import type { FeedbackCode } from "../../core/contracts";
import { serializeError } from "../../utils/serializeError";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";

export const CRITICAL_NOTICE_KINDS = ["ARRIVAL", "EXIT", "MOCK", "MONITORING_STOPPED", "RECOVERY_FAILED"] as const;

export type CriticalNoticeKind = (typeof CRITICAL_NOTICE_KINDS)[number];

export const IN_APP_CRITICAL: Partial<Record<FeedbackCode, CriticalNoticeKind>> = {
  AUTO_CHECKIN: "ARRIVAL",
  ARRIVAL_CONFIRMED: "ARRIVAL",
  EXIT_DETECTED: "EXIT",
};

/** Android no entrega un recibo de que el aviso se mostró. */
export const DISPLAY_LIMIT = "ANDROID_CANNOT_CONFIRM_DISPLAY";

export async function recordCriticalNotice(input: {
  sessionId: number | null;
  kind: CriticalNoticeKind;
  phase: "CREATED" | "ACKNOWLEDGED";
  channel: "OS_NOTIFICATION" | "IN_APP";
  acceptedByOs?: boolean | null;
  feedbackShown: boolean;
  userAcknowledged: boolean;
}): Promise<void> {
  const session = input.sessionId !== null ? await PersistenceService.getSession(input.sessionId).catch(() => null) : null;
  const state = session?.domainStatus ?? null;
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId: input.sessionId,
        actor: input.userAcknowledged ? "USER" : "SYSTEM",
        intent: input.phase === "ACKNOWLEDGED" ? "NOTIFICATION_ACKNOWLEDGED" : "NOTIFICATION_POSTED",
        fromState: state,
        toState: state,
        reason: input.kind,
        timestampMs: TimeAuthorityService.now(),
        integrityClass: null,
        data: {
          kind: input.kind,
          phase: input.phase,
          channel: input.channel,
          acceptedByOs: input.acceptedByOs ?? null,
          displayConfirmed: false,
          displayLimit: DISPLAY_LIMIT,
          feedbackShown: input.feedbackShown,
          userAcknowledged: input.userAcknowledged,
        },
      },
      db,
    );
  });
}

export function recordCriticalNoticeSafely(input: Parameters<typeof recordCriticalNotice>[0]): void {
  recordCriticalNotice(input).catch((error) => {
    LoggingService.log("NARANJA", "NOTIFICACION", "WARN", "No se pudo anotar el aviso crítico", serializeError(error));
  });
}

const CRITICAL_KIND_SET = new Set<string>(CRITICAL_NOTICE_KINDS);

/** Kinds marcados en el data de una notificación del sistema. */
export function criticalKindsOf(data: unknown): CriticalNoticeKind[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const many = record.criticalKinds;
  if (Array.isArray(many)) return many.filter((kind): kind is CriticalNoticeKind => typeof kind === "string" && CRITICAL_KIND_SET.has(kind));
  const one = record.criticalKind;
  return typeof one === "string" && CRITICAL_KIND_SET.has(one) ? [one as CriticalNoticeKind] : [];
}

/** El aviso en la app se mostró (toast) o el operario lo cerró (diálogo). */
export function markCriticalFeedbackShown(code: string, sessionId: number | null, userAcknowledged: boolean): void {
  const kind = IN_APP_CRITICAL[code as FeedbackCode];
  if (!kind) return;
  recordCriticalNoticeSafely({
    sessionId,
    kind,
    phase: "ACKNOWLEDGED",
    channel: "IN_APP",
    acceptedByOs: null,
    feedbackShown: true,
    userAcknowledged,
  });
}
