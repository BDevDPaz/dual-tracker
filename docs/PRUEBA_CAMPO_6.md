# Prueba de campo 6 — 21 oct 2026

Samsung S22+, Android 12 o posterior. Build de esta rama (Fase 2 de la auditoría). No reutilices un APK anterior. Anota la hora de cada paso. Si algo no cuadra, guarda el comprobante, el JSON del expediente y una captura de Salud del sistema.

Esta fase no cambia el cálculo de la nómina, ni las transiciones de la jornada, ni el hash de los asientos que ya estaban. Un expediente sellado antes sigue verificando. Una señal de riesgo (ajuste, sello, expurgo, permiso, GPS, avisos, batería, ubicación aproximada) no baja el pago.

## Qué se prueba

1. **Ajuste manual.** Cada corrección deja en el libro el valor de antes y el de después, con actor, fecha y motivo. Una segunda corrección muestra la versión intermedia en su propio asiento. El original de la primera versión sigue guardado para restaurar el GPS, pero ya no es la única forma de ver lo que hubo en medio.
2. **Id forense de la jornada.** Al cerrar se añade `SESSION_SEALED`. El PDF y el JSON del expediente muestran ese SHA-256 como id forense. Verificar el expediente tiene que aceptarlo. Si se cambia el id a mano, la verificación falla.
3. **Expurgo del rastro.** Borrar migas viejas y el asiento `TRACE_PURGED` ocurren juntos. No queda un borrado sin asiento. Las entradas y salidas no se borran.
4. **Salud operacional.** Al cambiar un permiso, el GPS, los avisos o el ahorro de batería, el libro gana un asiento. Repetir la misma lectura no lo duplica. En Android 12+, la ubicación solo aproximada se ve en Salud como aviso y no cuenta como concedida del todo. No pasa la jornada a revisión por eso y no cambia el pago.

## Límites que esta prueba no puede saltar

- El id forense cubre los asientos de esa jornada hasta el cierre, en orden. Un ajuste posterior queda en el libro, pero no reescribe el sello. Así se ve qué estaba cerrado y qué se cambió después.
- Una jornada cerrada antes de esta versión no tiene `SESSION_SEALED`. Verificar un expediente viejo no lo exige. No reselles el del 20 oct para esta prueba.
- La primera lectura de permisos, GPS, avisos y batería también se asienta: antes no había ancla. A partir de ahí solo entra un asiento si el estado cambia.
- La ubicación aproximada es un aviso. No bloquea VALIDADA y no recorta horas. Si además faltan los servicios de ubicación o el permiso de segundo plano, eso sí sigue el criterio de siempre.
- Android no avisa de forma fiable de que una notificación se haya pintado en pantalla. Aquí solo queda el cambio del permiso de avisos.
- El worker de fondo no baja de 15 min. Esta prueba no espera a que Samsung mate el proceso: eso sigue en la prueba de campo 5.
- Un dispositivo con root puede editar la base. El libro y el expediente firmado lo delatan al verificar. Esta fase no cifra el archivo SQLite.

## Checklist

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| S31 | Inicia una jornada en un destino real, deja que fiche y ciérrala con horas reales. | El libro tiene el cierre y, justo después, `SESSION_SEALED`. El pago de esas horas es el de siempre. |
| S32 | En la jornada cerrada, corrige la hora de entrada y escribe una nota. Guarda. Vuelve a corregirla a otra hora, con otra nota. | Hay dos `MANUAL_PATCH`. El primero trae el antes (lo fichado) y el después. El segundo trae como antes el después del primero. La nota no aparece en claro en el libro. La clase pasa a ajuste manual. El importe sigue saliendo de las horas corregidas, no de un recorte por «riesgo». |
| S33 | Sella el periodo. Abre el PDF del empleado y el del empleador, en español y, si el perfil está en inglés, también en inglés. | Los dos dicen «Id forense de la jornada» (o «Session forensic id») y el mismo SHA-256. El JSON del expediente trae `sessionSeals` con ese hash. Verificar el expediente da válido. |
| S34 | No reselles un expediente anterior (el del 20 oct, si sigue en el teléfono). Ábrelo y verifícalo. | Sigue verificando. No hace falta que tenga id forense. |
| S35 | En Ajustes de Android, deja la ubicación de Dual Tracker en «aproximada» (no precisa). Abre Salud del sistema. | La fila de ubicación en uso no dice «Concedido» a secas: dice que es solo aproximada y que no está concedida del todo. Hay un aviso. No dice que bloquee VALIDADA. El libro tiene `PERMISSION_REVOKED` con permiso `precise`. La jornada, si la cierras con horas reales, no pierde pago por ese aviso. |
| S36 | Vuelve a activar la ubicación precisa. | Salud la da por concedida. El libro suma `PERMISSION_GRANTED` de `precise` una sola vez. Salir y entrar a Salud no repite el asiento. |
| S37 | Quita el permiso de ubicación en segundo plano y vuelve a darlo. Apaga y enciende el GPS del sistema. Niega y concede los avisos. Activa y desactiva el ahorro de batería para Dual Tracker. | Cada cambio deja un asiento (`PERMISSION_REVOKED` / `PERMISSION_GRANTED`, `GPS_DISABLED` / `GPS_ENABLED`, `NOTIFICATION_DISABLED`, `BATTERY_OPTIMIZATION_ENABLED` / `BATTERY_OPTIMIZATION_DISABLED`) y no se duplica si no cambia. El pago de una jornada ya cerrada no se mueve. |
| S38 | Con un periodo ya exportado y el plazo de retención vencido (o el que tenga la empresa en Ajustes), deja que corra el barrido. | Si se borra miga de pan, hay un `TRACE_PURGED` con el número borrado. Las entradas y salidas siguen. Si no toca borrar nada, no aparece un asiento de más. |
