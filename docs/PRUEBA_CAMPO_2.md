# Prueba de campo 2 — 19 oct 2026 (build 6)

Expediente `W2026-10-19-5a1d9a4e`. Dos jornadas, 44 asientos, cadena íntegra, bruto $87.08. La deriva de reloj de la prueba 1 no se repitió. Las dos jornadas salieron como **cierre automático** y el rastro llegó con 0 puntos.

La nómina (minutos, tramos, tarifas, importes) no cambia. El algoritmo de `packHash` y `contentHash` tampoco: un expediente ya sellado se verifica igual. El PDF viejo no se reescribe. Lo que cambia es el dato de las jornadas nuevas (clase de integridad, reglas que de verdad produjeron minutos) y el HTML de los PDF que se generen a partir de ahora.

## Qué pasó

1. **El teléfono se apagó en la jornada 1.** El corte de las 22:53 (`WATCHDOG` / `MARK_ORPHAN`) era correcto: no había señal y no había lectura dentro del sitio. El operario siguió con `CONTINUE_ORPHAN` y cerró él mismo (`CLOSE_DAY`, `EXIT_CONFIRMED_BY_USER`). El comprobante igual decía «CIERRE AUTOMÁTICO» y el rollup contaba 2 cierres automáticos.
2. **El almuerzo paró el servicio de ubicación.** En la jornada 2, en `PAUSADA`, el sistema anotó `INTEGRITY_DEGRADED_FOREGROUND_SERVICE_STOPPED` (23:12). Cuatro toques de `RESOLVE_MANUAL` (23:13–23:14) dejaron la jornada en «Por revisar». Al reanudar, `RESOLVE_KEEP_GPS` la pasó a cierre automático y el cierre del operario no lo corrigió.
3. **El rastro no tenía migas.** Las dos trazas del manifiesto salieron con `pointCount` 0 y `dwellBySite` vacío. En el plano, los controles de zoom se montaban sobre el dibujo (el menos salía partido), los pines quedaban cortados y debajo de la flecha del norte, y no había línea.
4. **Reglas que no se aplicaron.** Doble tiempo y séptimo día estaban activados para la prueba, con 0 minutos de cada uno. El PDF decía «aplicada en este periodo» y, otra vez, «activado». `appliedRules` las listaba igual.
5. **ENTER de más en el borde.** Un ENTER no fiable salió 2 ms (y otro 764 ms) después de un EXIT de la misma región. También hubo ENTER fiables repetidos en unos dos minutos, con timestamps que no iban en orden.

## Causa

- `CONTINUE_ORPHAN` guardaba la clase `AUTO`. `CLOSE_DAY` del operario no la tocaba. El sello pinta la clase, así que «cierre automático» y `byClass.AUTO` decían que el sistema había cerrado. No lo había hecho.
- `OS_KILL` ya guardaba `gapMs` en el asiento, pero el comprobante solo mostraba el código `HEARTBEAT_GAP`. Sin reloj de arranque no se podía separar «el teléfono se apagó» de «la app murió».
- En almuerzo `shouldRun` era falso y el perfil de muestreo era null, así que el servicio en primer plano se detenía. Con la jornada abierta, eso bloquea VALID. `RESOLVE_MANUAL` ponía MANUAL y, en la misma transición, el entorno degradado lo volvía a CONFLICT. Por eso el primer toque no se quedaba. El siguiente primer plano podía repetirlo.
- El perfil en sitio pedía 50 m de desplazamiento. En Android, con ese mínimo, el aviso por tiempo no llega si el operario no se mueve. Una jornada quieta no guarda migas. `dwellBySite` sale de esas migas, así que también iba vacío. El plano ya sabía dibujar la línea: no había puntos. El zoom iba dentro del marco, con el carácter «−» (U+2212), que en el teléfono se parte. El encuadre usaba el mismo margen por los cuatro lados y el pin, dibujado por encima del punto, se salía y tapaba la flecha del norte.
- `appliedRules` se llenaba si la bandera estaba encendida, no si la regla había producido minutos. El PDF imprimía la línea de «aplicada» y, debajo, la de «activado».
- La ventana de ENTER era 90 s y solo hacia atrás. Un ENTER no fiable justo después de un EXIT no se miraba. Los timestamps fuera de orden se escapaban.

## Qué quedó

- Seguir tras un corte deja la clase **MANUAL** y el motivo `ORPHAN_CONTINUED`. Si el operario cierra esa jornada, el motivo pasa a `RECOVERED_CLOSED`. El comprobante dice **Recuperada**. El rollup la cuenta en ajustes manuales, no en cierres automáticos. No hay una quinta clase: `byClass` entra en el statement y un sello viejo no se recalcula.
- Un `AUTO` que no sea un cierre del sistema (12 h o abandono) y que cierre el operario pasa a MANUAL. El cierre automático de verdad sigue siendo AUTO.
- `OS_KILL` anota el hueco (último latido → vuelta de la app). Si el reloj de arranque dice que el teléfono reinició después del latido, también anota el apagado (latido → reinicio). Si el teléfono siguió encendido, no se inventa un apagado. El comprobante nuevo lo muestra. No entra en el hash: es presentación. El módulo nativo `DeviceUptime` lee ese reloj en el próximo build; sin él el hueco se anota igual.
- El servicio de ubicación sigue en marcha durante el almuerzo. No se guardan migas en `PAUSADA` (el almuerzo no rastrea el destino personal). `RESOLVE_MANUAL` con la jornada abierta se queda en MANUAL aunque el servicio esté parado en ese instante. Un primer plano posterior no vuelve a degradar por el mismo servicio parado si el operario ya resolvió o siguió tras el corte. Otro sensor sí puede degradar. El botón ignora un segundo toque durante 800 ms; si la jornada ya no está en conflicto, el aviso es el de siempre.
- En sitio la distancia de muestreo es 0: manda el reloj (5 min). Con batería por debajo de 35 % el intervalo se dobla; por debajo de 20 % se triplica. El traslado sigue más frecuente. Hace falta el modo **Miga de pan**: en Solo geocerca no se guardan puntos, a propósito.
- Una regla sale en `appliedRules` solo si produjo minutos. En el PDF, esa regla dice «aplicada en este periodo». Si la bandera está encendida y los minutos son 0, dice «activada», una sola vez. Tránsito no cambia.
- ENTER de la misma región dentro de 2,5 min, hacia atrás o hacia adelante, se escribe una vez. Un ENTER fiable después de uno no fiable sí se anota. Un ENTER no fiable a menos de 5 s de un EXIT de la misma región no se anota. Otro sitio sí. No se borra nada ya escrito.

## Checklist en el teléfono

Mismo equipo (Samsung, español). Build nuevo, sin reutilizar el APK del 19 oct. En Ajustes, modo de rastro **Miga de pan** antes de empezar. Anota hora y, si algo falla, una captura de Salud. Basta una jornada con dos destinos y un almuerzo corto. No hace falta repetir las 3 h.

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| G1 | Inicia la jornada en el primer destino y quédate quieto dentro del radio al menos 6 min (más que el intervalo en sitio). | El rastro de esa jornada tiene al menos un punto y `dwellBySite` no sale vacío al sellar. En el plano se ve la línea, los pines enteros y sin montarse sobre la flecha del norte. Los botones +, − y 1 están debajo del plano, no encima. |
| G2 | Camina al segundo destino. | Sigue la misma jornada. Los ENTER de cada región no se repiten dentro de un par de minutos. Un ENTER fiable después de uno no fiable sí queda. |
| G3 | En el borde, sal y deja que el teléfono avise EXIT. No vuelvas a entrar de verdad. | Si aparece un ENTER no fiable a los milisegundos de ese EXIT, no se guarda. Una reentrada clara, minutos después, sí. |
| G4 | Pon almuerzo. Mira la notificación persistente y Salud. | El servicio de ubicación sigue activo. La jornada no pasa a «Por revisar» solo por el almuerzo. No se dibuja el camino del almuerzo. |
| G5 | Si aun así queda en Revisar, escribe una nota y toca resolver una vez. Toca otra vez enseguida. | El primer toque deja la decisión (Ajuste manual) y avisa. El segundo no añade otro asiento. |
| G6 | Apaga el teléfono con la jornada abierta, enciéndelo y abre la app. Elige seguir. Cierra tú la jornada. | El libro anota el corte. Si el build trae el reloj de arranque, el comprobante dice cuánto estuvo apagado el teléfono (último latido → reinicio) y a qué hora volvió la app. La jornada dice **Recuperada**, no Cierre automático. El rollup no la cuenta como cierre automático. |
| G7 | Deja doble tiempo y séptimo día activados, pero no llegues a 12 h ni a siete días. Sella. | El PDF dice «activada», no «aplicada en este periodo», y cada regla sale una sola vez. |
| G8 | Abre el expediente del 19 oct (`W2026-10-19-5a1d9a4e`) y comprueba el código. | Sigue verificando. El PDF que ya se selló no cambia. $87.08 no se recalcula. |

## Reprueba — hora futura (`W2026-10-19-a2db0ad6`)

El 20 oct la jornada 3 se editó a 12:25 a. m.–11:58 p. m. y el expediente se selló a las 12:29 a. m. El fin quedaba unas 23 h por delante y se pagó (1353 min, con doble tiempo). La nómina y `packHash` / `contentHash` no cambian. Un expediente ya sellado se verifica igual. No se reescribe el libro: la hora que todavía no ha pasado se rechaza.

Hora de confianza: el máximo entre el reloj del teléfono y la hora de red en la que las dos fuentes concordaron, más 2 min. Sin red vale el reloj del teléfono.

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| H1 | Con una jornada ya cerrada, abre Editar sesión. Pon la salida en una hora posterior a ahora (si son las 12:30 a. m., 11:58 p. m.). Escribe una nota y toca Guardar. | El campo dice que esa hora es posterior a ahora. Guardar no se habilita. El libro no gana un asiento y el fin no cambia. |
| H2 | Cierra a mano e indica un almuerzo que termine después de ahora, y otro que empiece antes de la jornada. | El primero avisa la hora futura. El segundo, que el almuerzo tiene que caber en la jornada. No se cierra. |
| H3 | En una jornada en Revisar, confirma un fin posterior a ahora. Luego uno anterior al inicio, sin cruzar la medianoche. | No cierra. El primero avisa la hora futura. El segundo, que el fin tiene que ser posterior al inicio. Si la salida en el reloj es anterior a la entrada y el día siguiente ya pasó, sí se guarda. |
| H4 | Si una jornada guardada termina después de ahora, sella el periodo. | No sella. Avisa que una jornada termina después de ahora. No aparece un expediente nuevo ni un asiento de sello. |
| H5 | Corrige ese fin a una hora ya pasada y sella. Abre el expediente del 19 oct. | Sella. El expediente anterior sigue verificando. Los minutos de una jornada que sí duró hasta las 11:58 no se recalculan por este cambio. |
