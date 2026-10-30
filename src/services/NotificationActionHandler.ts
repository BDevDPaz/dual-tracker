import * as Notifications from "expo-notifications";
import { workTrackerEngine } from "../core/workTrackerEngine";
import { NOTIFICATION_ACTIONS } from "../constants/notifications";
import { now } from "../utils/timeProvider";
import { log } from "../utils/logger";

/**
 * ActionDispatcher & StateMachineBridge
 * Escucha las respuestas a notificaciones y las traduce en eventos del motor.
 */
export function setupNotificationActionHandler() {
  const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const actionIdentifier = response.actionIdentifier;
    const { sessionId } = response.notification.request.content.data;

    log("AZUL", "NOTIFICACION", "INFO", "Acción de notificación recibida", {
      actionIdentifier,
      sessionId,
    });

    switch (actionIdentifier) {
      case NOTIFICATION_ACTIONS.NEW_JOB:
        if (sessionId) {
          await workTrackerEngine.dispatch({
            type: "SESSION_TRANSIT_STARTED",
            sessionId: Number(sessionId),
            trigger_source: "NOTIFICATION_ACTION",
            reason: "User selected new job after EXIT",
          } as any);
        }
        break;

      case NOTIFICATION_ACTIONS.END_SESSION:
        if (sessionId) {
          await workTrackerEngine.dispatch({
            type: "SESSION_CLOSED_MANUAL",
            sessionId: Number(sessionId),
            endAtMs: now(),
            trigger_source: "NOTIFICATION_ACTION",
            reason: "User closed session after EXIT",
          } as any);
        }
        break;

      case NOTIFICATION_ACTIONS.DAILY_SETUP:
        // Esta acción usualmente abre la app (opensAppToForeground: true).
        // El motor ya rehidrata el estado y la UI muestra el DailySetup si es necesario.
        break;

      default:
        // Manejar el toque general en la notificación si no es un botón específico
        if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          log("BLANCO", "NOTIFICACION", "DEBUG", "Usuario tocó la notificación (default action)");
        }
        break;
    }
  });

  return () => subscription.remove();
}
