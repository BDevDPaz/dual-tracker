# Soporte en la app

Soporte vive dentro de Ajustes. El texto va en la app (español e inglés), sin red, y cambia de idioma en el acto. El número de esta guía es `soporte.v3` (`SUPPORT_CONTENT_VERSION` en `src/support/contentVersion.ts`). La tanda 1 documentó `soporte.v2`; esta versión añade el PIN del empleador, el portal, el rango de Reportes y el plano del rastro.

La nómina no se toca. El modo práctica no escribe la base, el registro de integridad, los expedientes ni la geocerca.

## Dónde está

- Ajustes → sección Soporte → abre `/support`.
- Cada pantalla tiene «?» (etiqueta accesible «Ayuda de esta pantalla»). Abre `/support/guide/<pantalla>`.
- El manual, las preguntas y los problemas están en el índice de Soporte.
- El modo práctica es `/support/practice`, con la cinta ámbar «Modo práctica».

El signo «?» no es una frase. El resto del texto sale de `t()`.

## Cómo está armado

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Textos | `src/i18n/supportEs.ts`, `supportEn.ts` | Árbol `support.*`. Inglés tipado como el español. |
| Catálogo | `src/support/catalog.ts` | Solo claves i18n: flujos, pantallas, prioridad de consejos. |
| Recorrido | `src/components/support/Walkthrough.tsx` | Contador, tarjeta y control resaltado con el color de acento. |
| Consejos | `src/components/support/ScreenTips.tsx` | Uno a la vez. Descartar lo guarda. |
| Memoria | `src/support/memory.ts` | AsyncStorage `dt.support.tips.v1` y `dt.practice.v1`. No es SQLite. |
| Práctica | `src/support/practice.ts` | Reductor en memoria. No importa servicios. |
| Diagnóstico | `src/support/diagnostic.ts` + caso de uso `exportSupportDiagnostic` | JSON de lista blanca, archivo en caché, hoja de compartir. |

Las pantallas emiten a lo sumo `EXPORT_SUPPORT_DIAGNOSTIC`. Práctica y consejos no son intenciones: no llegan al motor de jornadas.

`app/` no importa `src/services`. `src/support` no importa servicios, SQLite, ubicación, ledger, expedientes ni la geocerca.

## Mapa de contenido

### Flujos (recorrido paso a paso)

Cada flujo termina con un botón para entrar al modo práctica.

| Id | Título (es) | Pasos | Qué enseña |
| --- | --- | --- | --- |
| `startManual` | Iniciar jornada a mano | 3 | Iniciar jornada, Esperando llegada, Confirmar llegada |
| `startGeofence` | Iniciar jornada con la geocerca | 3 | Permitir siempre, geocerca activa, Diagnóstico de geocerca |
| `arrival` | Llegada | 2 | Confirmar llegada y En sitio |
| `transfer` | Traslado y varios destinos | 3 | Iniciar traslado, Confirmar llegada, Iniciar trayecto, misma jornada |
| `lunch` | Almuerzo | 3 | Iniciar almuerzo, minutos a descontar, Reanudar |
| `closeManual` | Cerrar a mano | 2 | Cerrar jornada y confirmar salida |
| `closeAuto` | Cierre automático | 2 | Salida detectada y pastilla Auto |
| `editNote` | Editar la sesión con nota | 2 | Revisar sesión y nota obligatoria |
| `forgotClock` | Olvidé fichar | 2 | No se inventa un día pasado: se corrige inicio y fin con nota (Ajuste manual) |
| `sealShare` | Sellar y compartir | 3 | Generar, sello antes de que termine la semana, compartir comprobante |
| `readStatement` | Leer el comprobante | 3 | «continúa el lun», columna de minutos, filas de 0 min omitidas |
| `states` | Qué significa cada estado | 3 | En sitio, Validada, No certificable |

### Pantallas con «?»

Hoy, Historial, Reportes, Ajustes, sesión, rastro, sitios, sitio nuevo, editar sitio, Salud, conflicto, estado de cuenta, expediente, bienvenida, aviso de incorporación, permisos, perfil, divulgación, retención, no encontrada, arranque, Soporte y práctica. La guía misma abre la ayuda de Soporte.

### Consejos (una vez, descartables)

Se muestra el primero que no esté descartado. Soporte → «Volver a mostrar los consejos» los borra (`dt.support.tips.v1`).

| Id | Cuándo |
| --- | --- |
| `transferSameSession` | Hoy, en traslado, en salida, o con jornada abierta (no en almuerzo) y más de un sitio. Texto fijo: «¿Vas a otro destino? Usa Iniciar traslado y Confirmar llegada en la misma jornada para que se pague el traslado» |
| `confirmArrivalInside` | Hoy, Esperando llegada |
| `lunch` | Hoy, En sitio |
| `samsungBattery` | Hoy o Salud, si la batería está restringida |
| `provisionalSeal` | Reportes o estado de cuenta, si el sello es anterior al fin del período |
| `splitWeek` | Historial, reportes, estado de cuenta o expediente, si hay fila partida |
| `zeroRows` | Reportes, estado de cuenta o expediente, si se omitieron filas de 0 min |
| `forgotClock` | Sesión o historial |
| `readDiag` | Salud |

### Preguntas

Viaje desde casa no se paga. Misma jornada para el traslado. Permitir siempre. Ubicación precisa. Samsung y batería. Por qué no fichó solo. Cómo leer Diagnóstico de geocerca. Notificaciones. Cambio de idioma. Sello provisional. Semana partida. Filas de 0 min. Aislamiento de la práctica. Guías sin internet.

### Problemas

1. El permiso no quedó en Permitir siempre.
2. La ubicación precisa está apagada.
3. Samsung: batería, apps en suspensión y Doze.
4. El check-in automático no ocurrió.
5. Cómo leer Diagnóstico de geocerca (Salud).
6. No llegan los avisos de salida.
7. El idioma no cambió en una guía.
8. El trayecto desde casa no apareció como tránsito.

### Estados que ve la persona

Máquina (`states.*`): Fuera de servicio, Esperando llegada, En sitio, En almuerzo, En traslado, Salida detectada, Jornada cerrada.

Integridad (`integrity.*`): Validada, Ajuste, Auto, Revisar, No certificable. «Ajuste manual» es el nombre del cambio de horas con nota (`ledger.MANUAL_PATCH`); en la pastilla se lee Ajuste. No certificable es el bloqueo de cifrado, no una clase de integridad.

## Modo práctica

Pantalla aparte, no un disfraz de Hoy. Al entrar se marca activa. Al salir (atrás, el botón, o ir a otra guía) se borra `dt.practice.v1` y el estado en memoria. El expediente real no se escribió, así que sigue igual.

Recorrido de demostración: iniciar a mano o por geocerca simulada, confirmar llegada, almuerzo, reanudar, iniciar traslado, confirmar llegada en el segundo sitio, salida, cierre manual o automático, nota (obligatoria; pasa a Ajuste), sello de ejemplo antes de que termine la semana, comprobante fijo (8.00 h, 480 min, $160.00, «continúa el lun», fila de 0 min que el comprobante del empleado no imprime). Las cifras son texto, no el motor de nómina.

Olvidé fichar exige nota y deja una jornada cerrada con Ajuste. No abre una segunda: hay que reiniciar la demostración.

## Diagnóstico

Soporte → Compartir diagnóstico. Intención `EXPORT_SUPPORT_DIAGNOSTIC`.

Escribe solo `cache/support/dual-tracker-support-diagnostic.json` y lo abre con la hoja de compartir del sistema. No usa la carpeta de expedientes y no añade un asiento al registro.

Entra: versión, compilación, `soporte.v3`, idioma, hora del recordatorio, modo de rastro, política y multiplicador de horas extra, radio, retención, límite de destinos, banderas de tránsito, calendario (inicio del día y de la semana), si terminó la incorporación, si aceptó el aviso, caducidad de la decisión de salida, estado del portal (`unconfigured`, `disabled` o `enabled`, nunca la dirección), estados de permiso (primer plano, segundo plano, notificaciones, servicio en primer plano, batería, monitoreo, servicios de ubicación, deriva del reloj, estado del cifrado), últimas filas del diagnóstico de geocerca (hora, tipo, región, id de sitio, precisión en metros, aceptado, motivo) y los id de consejos descartados.

No entra: coordenadas, nombre, tarifa, empleador, correo, notas, alias, dirección, sobres `enc:v1`, ni ninguna cadena con `@`.

## Lista en el teléfono (S1–S16)

Samsung Galaxy S22+ (o el equipo de Byron), build de la app, español al empezar. Anota versión, compilación y `soporte.v3` (los ves en Soporte).

| Caso | Pasos | Esperado |
| --- | --- | --- |
| S1 | En Hoy pulsa «?». | Se abre la guía de Hoy, en español, con pasos y los flujos relacionados. |
| S2 | En esa guía pulsa English y vuelve a Español. | El título, el paso y el control resaltado cambian en el acto, sin salir de la guía. |
| S3 | Con una jornada en traslado (o en salida) y otro sitio guardado, en Hoy lee el consejo del traslado. Pulsa «Entendido, no volver a mostrar». Mata la app y vuelve a Hoy. | El consejo no reaparece. |
| S4 | Ajustes → Soporte → «Volver a mostrar los consejos». Vuelve a Hoy en el mismo momento. | El consejo vuelve. |
| S5 | Soporte → Entrar al modo práctica. | Cinta «Modo práctica». Inicia, llega, traslada y cierra. |
| S6 | Antes de entrar, anota una jornada real en Historial. Haz el recorrido de S5. Vuelve a Historial sin haber fichado de verdad. | La jornada real no cambió. No hay sitio, expediente ni geocerca nuevos. |
| S7 | Sal del modo práctica (atrás o «Salir del modo práctica»). | La cinta desaparece. Hoy muestra tus datos, no la obra demo. |
| S8 | Soporte → Compartir diagnóstico. Abre el JSON. | Ves versión, permisos y filas de geocerca. No hay coordenadas, nombre, tarifa, correo ni `enc:v1`. |
| S9 | Soporte → Problemas → Samsung. | Habla de Permitir siempre, ubicación precisa, apps en suspensión y batería sin restricciones. |
| S10 | Salud → Diagnóstico de geocerca, y el «?» de Salud. | La guía explica Aceptado / Rechazado y que no hay mapa. |
| S11 | Abre la guía «Leer el comprobante» y, si tienes una semana partida, el estado de cuenta. | Ves «continúa el lun» (o el día que sigue) y la columna de minutos. |
| S12 | Si sellaste antes del domingo, abre Reportes. | El aviso de sello provisional y, si aplica, el consejo. |
| S13 | Soporte → pregunta «¿Se paga el viaje desde casa?». | La respuesta es no. El traslado pagado es entre dos destinos de la misma jornada. |
| S14 | Modo avión. Abre «?», un flujo y el índice. | Se leen igual. |
| S15 | En Soporte lee la línea de versión. | Versión de la app, compilación y guía `soporte.v3`. |
| S16 | Guía «Qué significa cada estado» y el glosario de Soporte. | Validada, Ajuste, Auto, Revisar, No certificable y Ajuste manual coinciden con las pastillas de la app. |

| Caso | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | | | | | | |
| S2 | | | | | | |
| S3 | | | | | | |
| S4 | | | | | | |
| S5 | | | | | | |
| S6 | | | | | | |
| S7 | | | | | | |
| S8 | | | | | | |
| S9 | | | | | | |
| S10 | | | | | | |
| S11 | | | | | | |
| S12 | | | | | | |
| S13 | | | | | | |
| S14 | | | | | | |
| S15 | | | | | | |
| S16 | | | | | | |
