/**
 * Aviso de ubicación simulada. Una vez por jornada abierta.
 * No cambia la clase de integridad ni el pago: solo avisa y la Salud lo muestra.
 */
import { StoreActions } from "../../core/store";
import { t } from "../../i18n";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { NotificationService } from "./NotificationService";

export async function noteMockedFix(sessionId: number): Promise<void> {
  StoreActions.healthUpdated({ mockLocation: true });
  const prev = await PersistenceService.getKv<number>(KV_KEYS.MOCK_NOTICE);
  if (prev === sessionId) return;
  await PersistenceService.setKv(KV_KEYS.MOCK_NOTICE, sessionId);
  await NotificationService.notifyImmediate(t("notifications.mockLocationTitle"), t("notifications.mockLocationBody"));
}
