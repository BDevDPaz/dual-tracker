# Prueba de campo 7 — 22 oct 2026

Samsung S22+, Android 12 o posterior. Build de esta rama (Fase 3 de la auditoría). No reutilices un APK anterior: las opciones de desarrollador y las rutas de root salen de un módulo nativo que solo está en el binario nuevo. Anota la hora de cada paso. Si algo no cuadra, guarda el comprobante, el JSON del expediente y una captura de Salud del sistema.

Esta fase no cambia el cálculo de la nómina, ni las transiciones de la jornada, ni el hash de los asientos o expedientes que ya estaban. Un expediente sellado antes sigue verificando. Una señal de riesgo (monitoreo degradado, anomalía, root, emulador, opciones de desarrollador, puntaje de confianza) no baja el pago y no quita VALIDADA.

## Qué se prueba

1. **Estado de monitoreo.** En Salud del sistema, con jornada abierta, el estado derivado es uno de: Inactivo, Iniciando, Monitoreando, Degradado, Recuperando, Fallo. No es el estado de la jornada. Degradado aparece si no hay una muestra de ubicación en 5 minutos, aunque el worker siga latiendo. El último hecho espacial y el último heartbeat dejan de verse en verde cuando tienen 5 minutos o más.
2. **Latido por componente.** Salud lista ubicación, geocerca, worker y vigilante con la hora de su último latido. En primer plano el agregado sigue en torno a 60 s. En segundo plano cada componente se marca cuando corre (miga, geocerca, worker, vigilante). No hay un temporizador nuevo de 30 s.
3. **Aviso persistente.** La notificación de la jornada dice el destino, el GPS (correcto, sin señal, simulado, apagado) y el estado de monitoreo, en el idioma del perfil. Ya no es el texto fijo de siempre.
4. **Anomalías.** El libro gana asientos con severidad LOW, MEDIUM, HIGH o CRITICAL: ubicación simulada, salto, viaje imposible, deriva de reloj, aleteo del perímetro, pérdidas de señal seguidas, señal perdida y recuperada, ubicación quieta por horas, servicio parado. Repetir la misma situación no duplica el asiento. El hecho original sigue en el rastro.
5. **Integridad del dispositivo.** Salud y el expediente muestran opciones de desarrollador, emulador y root cuando el teléfono lo permite. Si no hubo lectura, dice que no hay lectura: no afirma que el teléfono esté limpio. Un cambio se asienta una vez.
6. **Confianza de la ubicación.** Cada jornada tiene un puntaje 0–100 con etiqueta Excelente, Buena, Regular o Sospechosa. Sale en Salud y en el PDF (empleado y empleador, español e inglés). El texto dice que es informativo.

## Límites que esta prueba no puede saltar

- Sin un binario compilado con este módulo, root y opciones de desarrollador quedan en «sin lectura». `expo-device` sí puede marcar un emulador (`isDevice`). No se afirma limpieza cuando la lectura no llegó.
- No se añadió un muestreo de GPS más frecuente. Dentro del sitio la miga sigue en torno a 5 min, así que Degradado puede verse un momento hasta la siguiente muestra. Esperando sigue en unos 2 min y el traslado en unos 30 s.
- El puntaje y las anomalías no cambian el pago ni VALIDADA. CRITICAL (root) tampoco recorta horas.
- El root es la existencia de rutas (`su`, Magisk, busybox). Un Magisk oculto puede no salir. Una ROM cuya huella contenga «generic» puede marcar emulador sin serlo. SELinux puede ocultar rutas.
- Las opciones de desarrollador se leen con el módulo nativo (`Settings.Global`). Hace falta el build de EAS de esta fase. En iOS no se afirma root ni opciones de desarrollador.
- Los límites de Android 12+ para arrancar el servicio en primer plano no cambian. El hueco que deja la jornada huérfana sigue en 45 min. El worker no baja de 15 min. El sueño profundo de Samsung y la reanudación tras el apagado siguen en las pruebas de campo 5 y 1.
- `service_health` es local. No entra en el expediente. Las anomalías se deduplican; el hecho crudo no se borra. `GPS_LOST` es pérdida de señal, distinto de `GPS_DISABLED` (el GPS del sistema apagado).
- El payload del libro sigue en versión 2. El manifiesto del expediente sigue en versión 5. Un expediente viejo, sin puntaje ni integridad de dispositivo, sigue verificando. No reselles el del 20 oct para esta prueba.

## Checklist

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| S39 | Inicia una jornada en un destino real y espera la primera muestra. Abre Salud. | El estado de monitoreo dice Monitoreando (o Iniciando si todavía no hay muestra). El último hecho espacial y el último heartbeat tienen hora y se ven en verde. La jornada sigue ACTIVA y VALIDADA. El pago de unas horas reales es el de siempre. |
| S40 | Con la jornada abierta, deja el teléfono quieto más de 5 min sin una muestra nueva (modo avión un momento, o espera el intervalo de la miga). Abre Salud. | El estado pasa a Degradado. El último hecho, si tiene 5 min o más, ya no está en verde. La jornada no cambia de estado ni de clase por eso. Al volver la señal, el aviso persistente y Salud vuelven a Monitoreando. |
| S41 | Mira la notificación persistente de Dual Tracker, en español y con el perfil en inglés. | El texto trae el alias del destino, el GPS y el estado de monitoreo. No es solo «Jornada en curso · monitoreo de zona activa» / «Shift in progress · zone monitoring active». |
| S42 | En Salud, revisa el bloque de latido por componente. | Aparecen ubicación, geocerca, worker y vigilante. El que ya corrió tiene hora. El que no, «Sin latido». No hace falta un latido cada 30 s. |
| S43 | Activa las opciones de desarrollador. Si puedes, compara con un emulador o un teléfono con root. Si no, anota «no aplica». | Salud muestra la señal que corresponda (opciones de desarrollador, emulador, root). El libro tiene un `DEVICE_INTEGRITY` y no lo repite si sales y entras a Salud. La jornada no pasa a revisión y el importe no baja. |
| S44 | Provoca una anomalía que puedas repetir sin peligro: GPS apagado no cuenta como `GPS_LOST`; deja de haber muestras 5 min, o activa una app de ubicación simulada si ya la usaste en la prueba de campo 5. | Hay un asiento (`GPS_LOST`, `MOCK_LOCATION`, `GPS_JUMP` u otro del catálogo) con severidad. La segunda lectura igual no duplica. El punto original sigue en el rastro. `GPS_LOST` no aparece si el GPS del sistema está apagado: eso sigue siendo `GPS_DISABLED`. |
| S45 | Cierra la jornada con horas reales y sella el periodo. Abre el PDF del empleado y el del empleador, en español y, si el perfil está en inglés, también en inglés. | Los dos muestran el puntaje (Excelente, Buena, Regular o Sospechosa / Excellent, Good, Fair, Suspicious) y dicen que no cambia el pago. Si hubo lectura de dispositivo, también sale. El JSON trae `locationTrust` y `deviceIntegrity`. Verificar el expediente da válido. El importe es el de las horas, no un recorte por el puntaje. |
| S46 | No reselles un expediente anterior. Ábrelo y verifícalo. | Sigue verificando. No hace falta que traiga puntaje ni integridad de dispositivo. |
