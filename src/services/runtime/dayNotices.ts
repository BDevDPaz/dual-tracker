/**
 * Textos de N10, N12, N15, N16 y N17. La pantalla apagada los muestra;
 * los botones del aviso (toque sin abrir la app) se cablean en PR 3
 * salvo el identificador, que ya viaja en el aviso para poder probarlo.
 */
import type { SessionPayrollPreview, SessionRecord } from "../../core/contracts";
import { NOTIFICATION_ACTIONS } from "../../constants/notifications";
import { t } from "../../i18n";
import { formatCurrency, formatTime } from "../../utils/dateUtils";

export type DayAction = (typeof NOTIFICATION_ACTIONS)[keyof typeof NOTIFICATION_ACTIONS];

export interface NoticeContent {
  title: string;
  body: string;
  actions: DayAction[];
}

/** El almuerzo no se declaró: ni tomado ni minutos al cierre. */
export function lunchWasDeclared(session: SessionRecord): boolean {
  return session.lunch.taken || session.lunch.deductedMinutes !== null;
}

/** N10. Si no hubo almuerzo, «no se descontó» y Corregir va primero. */
export function daySummaryContent(session: SessionRecord, preview: SessionPayrollPreview | null): NoticeContent {
  const declared = lunchWasDeclared(session);
  const lunch = declared
    ? t("notifications.daySummaryLunch", { minutes: String(session.lunch.deductedMinutes ?? preview?.lunchMinutes ?? 0) })
    : t("notifications.daySummaryNoLunch");
  const hours = ((preview?.netMinutes ?? 0) / 60).toFixed(2);
  const exit = session.endAtMs ? formatTime(session.endAtMs) : "—";
  const estimate = formatCurrency(preview?.grossEstimate ?? 0);
  const ack = NOTIFICATION_ACTIONS.ACK_DAY;
  const correct = NOTIFICATION_ACTIONS.CORRECT_DAY;
  return {
    title: t("notifications.daySummaryTitle"),
    body: t("notifications.daySummaryBody", { hours, exit, lunch, estimate }),
    actions: declared ? [ack, correct] : [correct, ack],
  };
}

/** N17. AUTO nombra la hora. CONFLICT pide revisión. Nunca dice Validada. */
export function autoCloseContent(integrityClass: string, endAtMs: number | null): NoticeContent {
  if (integrityClass === "AUTO") {
    return {
      title: t("notifications.autoCloseTitle", { time: endAtMs ? formatTime(endAtMs) : "—" }),
      body: t("notifications.autoCloseBody"),
      actions: [],
    };
  }
  return {
    title: t("notifications.conflictCloseTitle"),
    body: t("notifications.conflictCloseBody"),
    actions: [],
  };
}

/** N16. Confirmar en la app (2×). Sin respuesta, el vigilante cierra a las 12 h. */
export function extendShiftContent(): NoticeContent {
  return {
    title: t("notifications.extendTitle"),
    body: t("notifications.extendBody"),
    actions: [NOTIFICATION_ACTIONS.EXTEND_SHIFT],
  };
}

/** N15. Seguir no abre la app. Terminé sí. */
export function orphanNoticeContent(): NoticeContent {
  return {
    title: t("notifications.orphanTitle"),
    body: t("notifications.orphanBody"),
    actions: [NOTIFICATION_ACTIONS.ORPHAN_CONTINUE, NOTIFICATION_ACTIONS.ORPHAN_END],
  };
}

/** N12, 30 min después de empezar el almuerzo. */
export function lunchResumeContent(): NoticeContent {
  return {
    title: t("notifications.lunchResumeTitle"),
    body: t("notifications.lunchResumeBody"),
    actions: [NOTIFICATION_ACTIONS.RESUME],
  };
}

export const LUNCH_RESUME_AFTER_MS = 30 * 60 * 1000;
