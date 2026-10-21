# Prueba de campo 5 — 21 oct 2026

Samsung S22+, Android. Build de esta rama (Fase 1 de la auditoría). No reutilices un APK anterior. Anota la hora de cada paso. Si algo no cuadra, guarda el comprobante, el JSON del expediente y una captura de Salud del sistema.

Esta fase no cambia el cálculo de la nómina, ni la máquina de estados de la jornada, ni el hash de los asientos que ya estaban. Un expediente sellado antes sigue verificando. Una señal de riesgo (ubicación simulada, salto, hueco de monitoreo) no baja el pago ni impide VALIDADA por sí sola. Lo que sí hace es no fichar sola cuando la lectura no es de fiar.

## Qué se prueba

1. **Ubicación simulada.** Una app de GPS falso no puede fichar la llegada. El registro a mano sigue permitido. Salud del sistema avisa. El PDF cuenta las lecturas simuladas. La notificación dice: «Se detectó ubicación simulada. La llegada automática fue suspendida.»
2. **Reentrada al borde.** Dos lecturas a 60 m, separadas 1 s, con ±40 m de error, no son un salto imposible. 120 km en 5 min sí lo son.
3. **El proceso muere.** Con la jornada abierta, si el servicio en primer plano ya no corre, el worker y el vigilante intentan arrancarlo (hasta 3 veces) y vuelven a registrar la geocerca. Queda en el libro: `MONITORING_STOPPED_DETECTED`, `SERVICE_RECOVERY` y, si no pudo, `SERVICE_RECOVERY_FAILED`. Un hueco de 5 min o más es `MONITORING_GAP`. La jornada huérfana sigue en 45 min: no se tocó ese umbral.

## Límites que esta prueba no puede saltar

- Android 12+ no deja arrancar un servicio en primer plano desde segundo plano, salvo exenciones. La que importa aquí es tener Dual Tracker fuera de la optimización de batería. Si el sistema niega el arranque, el error suele llamarse `ForegroundServiceStartNotAllowedException`. La app lo anota y pide abrir Dual Tracker. No hay forma honesta de forzarlo desde el worker.
- Android 14 exige el tipo `location` del servicio en primer plano y el permiso correspondiente.
- El worker de fondo (WorkManager) no baja de 15 min. Con Doze puede tardar horas. Por eso el paso de «espera 15 min» es el mínimo, no una garantía de que el sistema ya despertó la app.
- Un Force Stop, o las apps en suspensión profunda de Samsung, no se recuperan hasta que alguien abre Dual Tracker. El relanzamiento es best-effort.
- Volver a registrar la geocerca (`startGeofencingAsync`) no es un servicio en primer plano: eso sí se puede intentar desde el fondo.
- La notificación necesita el permiso de avisos. Sin él, el libro igual se escribe.

## Checklist

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| S22 | Dos destinos con coordenadas. Inicia la jornada en el primero y deja que fiche sola, con el GPS real. | La jornada queda activa. Salud no marca ubicación simulada. |
| S23 | Con una app de ubicación simulada, pon el punto dentro del primer sitio y espera el ENTER. No confirmes a mano. | No hay llegada automática. La jornada sigue en espera. Sale el aviso «Se detectó ubicación simulada. La llegada automática fue suspendida.» Salud muestra «Ubicación simulada · Detectada» como solo aviso: no bloquea VALIDADA. |
| S24 | Desactiva la simulación. Entra al sitio de verdad, o registra la llegada a mano. | La llegada a mano se acepta. La clase sigue pudiendo ser validada. El pago de esas horas no se recorta por la lectura falsa. |
| S25 | Mata el proceso de Dual Tracker (recientes). Optimización de batería **activada** para la app. Espera al menos 15 min con la jornada abierta. Ábrela. | En el libro hay `MONITORING_STOPPED_DETECTED`. Si Android negó el arranque: hasta 3 `SERVICE_RECOVERY` con éxito en falso, un `SERVICE_RECOVERY_FAILED` (severidad alta) y el aviso «El monitoreo se detuvo; abre Dual Tracker». La jornada no se cerró sola por eso. |
| S26 | Repite S25 con la optimización de batería **desactivada** (sin restricciones). Espera otros 15 min tras matar el proceso. | El servicio puede volver a arrancar: `SERVICE_RECOVERY` con éxito. Si el teléfono igual lo niega (Force Stop, suspensión profunda), queda el fallo y el aviso, no un cierre. |
| S27 | Con la jornada abierta y el GPS real, sal y vuelve a entrar rozando el borde (del orden de 60 m, error de unos ±40 m, en un segundo). | La reentrada se acepta. No sale «salto de ubicación imposible» por ese ruido. |
| S28 | No hace falta un viaje real de 120 km. Si en el diagnóstico aparece un salto de ese tamaño en pocos minutos, tiene que rechazarse. | Un salto así no ficha solo. La jornada no cambia de estado por ese rechazo. |
| S29 | Deja la jornada sin señal más de 5 min y menos de 45, luego ábrela. | Hay un `MONITORING_GAP` con los segundos del hueco. No es jornada huérfana. A los 45 min sin heartbeat y sin lectura dentro del sitio sigue el criterio de siempre (Revisar), sin haber movido ese umbral. |
| S30 | Cierra la jornada con horas reales, sella el periodo y abre el PDF del empleado y el del empleador. | Si hubo lecturas simuladas, el PDF lo dice y aclara que el pago no cambia. Si no hubo, el PDF no trae ese aviso. Un expediente ya sellado (el del 20 oct, por ejemplo) sigue verificando. No lo reselles para esta prueba. |
