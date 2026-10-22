# Prueba de campo 8 — 22 oct 2026

Samsung S22+, Android 12 o posterior. Build de esta rama (Fase 4 de la auditoría). No reutilices un APK anterior. Anota la hora de cada paso. Si algo no cuadra, guarda el comprobante, el JSON del expediente y una captura de Salud del sistema.

Esta fase no cambia el cálculo de la nómina, ni las transiciones de la jornada, ni el hash de los asientos o expedientes que ya estaban. Un expediente sellado antes sigue verificando. Una señal de riesgo (cobertura baja, aviso crítico, desajuste del libro, root, emulador) no baja el pago y no quita VALIDADA.

El payload del libro sigue en versión 2. El manifiesto del expediente sigue en versión 5. Lo nuevo entra en el contentHash solo si la clave está en el expediente. Un expediente viejo, sin cobertura ni reconstrucción, sigue verificando.

## Qué se prueba

1. **Cobertura de la jornada.** En Salud, con jornada abierta o con la última ya cerrada, se ve el porcentaje de tiempo con monitoreo y los minutos sin monitoreo. El hueco es la unión de `MONITORING_GAP`, de `GPS_LOST` hasta `GPS_RESTORED`, y del servicio parado hasta un `SERVICE_RECOVERY` con éxito. Sale también en el JSON del expediente y en los dos PDF (empleado y empleador, español e inglés). Es informativo.
2. **Avisos críticos.** El libro anota cuando se pide un aviso de llegada, salida, ubicación simulada, monitoreo detenido o recuperación fallida, y cuando el operario lo toca o lo reconoce en la app. `displayConfirmed` queda en false. Android no confirma que la notificación se haya pintado. `acceptedByOs` solo dice si el sistema aceptó programarla. Salud lo dice en texto claro.
3. **Minutos del libro.** Al sellar y al verificar, cada jornada se reconstruye desde sus asientos y se compara con la fila de `sessions` (trabajo, tránsito, descanso). Si no cuadra, la verificación trae `SESSION_REPLAY` y el expediente lo muestra. Nadie reescribe el pago ni la fila para “arreglarlo”. Si un paso no se puede repetir, el resultado es incompleto: eso no se presenta como desajuste.
4. **Libro.** Si no hay `prev_hash` repetido, el arranque crea el índice único `idx_ledger_prev_hash`. Si ya había duplicados, no crea el índice y lo deja en el log: no reescribe asientos y no impide abrir la app.
5. **Segmentación.** Un intervalo de más de 1000 jornadas se sigue truncando, pero ya no en silencio: queda un error en el log.
6. **Espera de llegada.** En Ajustes (zona admin) o en el destino se puede poner una espera en minutos antes del fichaje automático. 0, o vacío en el destino, es el comportamiento de siempre. Máximo 30. Cuando la espera se cumple, la hora de llegada sigue siendo la primera lectura dentro del sitio: no recorta el pago.
7. **Reinicio del teléfono.** Con jornada abierta, apaga y enciende el S22+ sin abrir Dual Tracker a mano. La geocerca que el sistema conservó, o el worker de fondo, pueden volver a correr. Si el reloj de arranque dice que el teléfono se reinició después del último latido, el libro gana un `BOOT_RESUME` (una vez por arranque). Sin ese reloj no se inventa el reinicio.

## Límites que esta prueba no puede saltar

- Expo no ejecuta JavaScript en el instante de `BOOT_COMPLETED`. El permiso `RECEIVE_BOOT_COMPLETED` ya está en `app.json`, igual que `expo-location` (segundo plano y servicio en primer plano), `expo-task-manager` y `expo-background-task`. No hay un receptor nativo nuevo que arranque el servicio en primer plano al encender: Android 12+ puede negarlo si la app está en segundo plano y no está exenta de batería. Ese fallo sigue siendo `SERVICE_RECOVERY_FAILED`.
- La geocerca registrada puede despertar la tarea sin abrir la app, y ahí se intenta reanudar el servicio. El worker (como mínimo 15 min) también lo intenta cuando el sistema lo deja correr. El sueño profundo de Samsung puede retrasar las dos cosas. Si no se abre la app y el sistema no despierta ninguna tarea, no hay `BOOT_RESUME` hasta que algo vuelva a ejecutar JavaScript.
- `displayConfirmed` es siempre false. Un toque en la notificación o un botón de la salida en la app sí es `userAcknowledged`. Ver el toast no es un toque.
- La cobertura y la reconstrucción no cambian el pago ni VALIDADA. Un desajuste no corrige la fila: hay que revisarlo.
- La espera por defecto es 0. No cambia el fichaje de las pruebas anteriores. La espera no usa un temporizador de Jest ni un `setTimeout`: hace falta otra muestra dentro del sitio, o el worker, para fichar cuando el tiempo ya pasó.
- Si la política de tránsito cambia después de congelar un tramo, la reconstrucción puede marcar desajuste sin que la fila se haya tocado. No se copian las banderas de pago guardadas: eso ocultaría un cambio.
- El índice único no se crea si ya hay `prev_hash` duplicados. Esos asientos se quedan. El hash de cada asiento sigue siendo único.
- El tope de 1000 jornadas al partir un intervalo sigue truncando. Ahora el log lo dice. No alarga la nómina.

## Checklist

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| S47 | Inicia una jornada en un destino real. Abre Salud. | La cobertura sale en porcentaje. Con monitoreo continuo está en 100% o cerca. El texto dice que no cambia el pago y que Android no confirma que un aviso se haya mostrado. La jornada sigue su estado de siempre. |
| S48 | Deja un hueco real: modo avión unos minutos, o el servicio se detiene, y vuelve. Cierra la jornada con horas reales y sella el periodo. | El JSON trae `monitoringCoverage` con minutos sin monitoreo mayores que 0 si el hueco quedó dentro de la jornada. Los PDF del empleado y del empleador, en español y en inglés, muestran el porcentaje y dicen que no cambia el pago. El importe es el de las horas. |
| S49 | Provoca un aviso que puedas reconocer: salida del sitio y pulsa «sigo trabajando», o una ubicación simulada si ya la usaste en la prueba de campo 5. | El libro tiene `NOTIFICATION_POSTED` con `displayConfirmed: false` y `displayLimit: ANDROID_CANNOT_CONFIRM_DISPLAY`. Si tocaste el aviso o el botón de la app, hay `NOTIFICATION_ACKNOWLEDGED` con `userAcknowledged: true`. La hora y el pago no cambian por el aviso. |
| S50 | En el expediente sellado, mira `sessionReplay`. Luego verifica el expediente. | Cada jornada del periodo dice `MATCH` si la fila cuadra con el libro. Verificar da válido. No reselles un expediente anterior: sigue verificando sin estos campos. |
| S51 | En Ajustes, zona admin, deja la espera de llegada en 0. Entra a un destino. | El fichaje automático es el de siempre, en la primera lectura fiable. |
| S52 | Pon 2 minutos de espera (global o solo en ese destino; vacío en el destino usa la de la empresa). Entra y quédate dentro. | No ficha en el primer instante. A los 2 minutos, con otra muestra o al correr el worker, ficha. La hora de llegada es la de la primera lectura dentro, no la de cuando se cumplió la espera. El pago no se recorta por esos 2 minutos. |
| S53 | Con una jornada abierta y el monitoreo en marcha, reinicia el S22+ y no abras Dual Tracker. Espera unos minutos. Si no pasa nada, abre la app solo para mirar el libro. | Si el sistema despertó la geocerca o el worker, hay un `BOOT_RESUME` con `limit: EXPO_NO_JS_AT_BOOT_COMPLETED` y la jornada sigue abierta. El servicio puede haber vuelto o haber quedado en `SERVICE_RECOVERY_FAILED` si Android 12+ lo negó. No se crea un segundo `BOOT_RESUME` del mismo arranque. La nómina no cambia. |
