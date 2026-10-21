# Prueba de campo 1 — 19 oct 2026

Expediente `W2026-10-19-bf620376`. Una sola jornada, 14:58–17:15 PT, cuatro geocercas, cadena íntegra, 99 asientos. La ubicación era buena y el cierre salió como **AJUSTE MANUAL** con 0 validadas.

La nómina (minutos, tramos, importes) no cambia. `packHash` y `contentHash` tampoco: un expediente ya sellado se verifica igual. El PDF viejo no se reescribe. El sello del encabezado entra en los PDF que se generen a partir de ahora.

## Qué pasó

1. **Deriva de reloj falsa.** 57 asientos `CLOCK_SAMPLED`, unos 40 con motivo `CLOCK_DRIFT`, muchos en el mismo minuto (16:10). Eso produjo 4 `INTEGRITY_DEGRADE` (`INTEGRITY_DEGRADED_CLOCK_DRIFT`) y 4 `RESOLVE_MANUAL`. La jornada entera quedó en ajuste manual.
2. **ENTER duplicado.** Cada geocerca dejó 2 o 3 `SPATIAL_FACT` `ENTER` en el mismo minuto (14:58, 16:28, 17:00).
3. **Salida no fiable en el borde.** A las 16:55, `EXIT_UNRELIABLE:HYSTERESIS`: el teléfono estaba en la banda, no claramente fuera.
4. **Sello partido.** En el comprobante, «SELLADO» del ángulo superior derecho salía cortado («SELL» / «ADO»).

## Causa

- La cabecera `Date` de Google y Cloudflare solo tiene segundos. El desfase ya usaba el punto medio de la ida y vuelta, pero una respuesta lenta se aceptaba igual, y **una sola** lectura por encima de 3 min bastaba para marcar deriva.
- Cada evento de geocerca y cada vuelta a primer plano volvía a muestrear. El tope de «cambió 1 s» anotaba casi todas: la ráfaga de las 16:10.
- Esa marca llamaba a `INTEGRITY_DEGRADE`. Con la jornada en Revisar, el operario tenía que resolver a mano y la clase pasaba a manual.
- El anti-rebote de ENTER era 5 s y solo en memoria. Android dispara el mismo ENTER varias veces en el minuto, y confirmar presencia escribe otro. El libro solo añade: el duplicado hay que no escribirlo.
- Una salida en la banda de histéresis (ni dentro ni claramente fuera) armaba la salida pendiente y, si el aviso original era fiable, podía confirmarse al vencer el debounce.
- El sello del PDF iba en la fila del título con `letter-spacing` alto y sin `nowrap`. El flex lo encogía, la palabra partía en dos líneas y el giro de −8° la sacaba del margen.

## Qué quedó

- Muestra de red: punto medio de la ida y vuelta, y se tira si la ida y vuelta pasa de 1,5 s.
- Hacen falta 3 lecturas, separadas al menos 90 s, del mismo signo y con desfase parecido (a 60 s), antes de anotar `CLOCK_DRIFT`.
- Como mucho una muestra por minuto. Una ráfaga de geocerca o de primer plano no llena el libro.
- La deriva de red se anota **una vez** por jornada. Si ya hay un ENTER fiable, o la llegada está confirmada, es un aviso: la jornada sigue VALIDADA. Sin llegada, sí pasa a Revisar.
- El salto del reloj del teléfono (pared contra reloj monótono, más de 3 min) sigue bloqueando VALIDADA.
- ENTER de la misma región dentro de 90 s: se escribe una vez. Otro sitio sí se anota. Un ENTER fiable después de uno no fiable también (la evidencia mejora). No se borra nada ya escrito.
- La banda de histéresis no arma ni confirma salida. El hecho, si el sistema avisa, se guarda como no fiable (`EXIT_UNRELIABLE:HYSTERESIS`).
- El sello va en una sola línea, con hueco para el giro, origen del giro a la derecha. Solo afecta al HTML de los PDF nuevos.

## Checklist en el teléfono

Mismo equipo que la prueba (Samsung, español). Build nuevo, sin reutilizar el APK del 19 oct. Anota hora y, si algo falla, una captura de Salud → Diagnóstico de geocerca. No hace falta otro expediente de 99 asientos: basta una jornada corta con dos destinos.

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| F1 | Inicia la jornada en el primer destino y quédate dentro hasta que fiche solo. Abre y cierra la app varias veces en un minuto. | Un solo ENTER fiable de esa región en ese minuto. No una ráfaga de `CLOCK_DRIFT`. La jornada sigue en sitio y validada. |
| F2 | Con la jornada en sitio, espera a que pasen unos minutos (o camina al borde y vuelve) y mira el registro. | Como mucho una comparación de hora de red por minuto. Si aparece deriva, es una sola línea y la clase no pasa a ajuste manual ni a Revisar mientras la ubicación sea buena. |
| F3 | Adelanta el reloj del teléfono más de 3 min y vuelve a la app. | Esto sí deja la jornada en Revisar por deriva del reloj del teléfono. No es el aviso de la hora de red. |
| F4 | Pon el reloj en hora otra vez. Inicia otra jornada (o sigue, si F3 no cerró) y cruza al segundo destino. | Un ENTER fiable del segundo sitio, no dos o tres en el mismo minuto. Sigue siendo la misma jornada. |
| F5 | Con la jornada en sitio desde hace más de 2 min, quédate en el borde del radio (no te alejes 50 m de más). Espera 3 min. | No pasa a «Salida detectada». Si el registro anota una salida, es no fiable, con histéresis, y la jornada sigue en sitio. |
| F6 | Aléjate de verdad (radio + más de 50 m) y espera unos 2 min. | Aviso de salida. La hora es la primera salida clara. Puedes seguir, trasladarte o cerrar. |
| F7 | Cierra la jornada con la ubicación en orden (sin haber movido el reloj) y sella el periodo. | El comprobante dice Validada, no Ajuste manual, si no hubo otro motivo. El sello «SELLADO» se lee entero en la esquina superior derecha, sin partirse. |
| F8 | Abre el expediente del 19 oct (`W2026-10-19-bf620376`) y comprueba el código. | Sigue verificando. El PDF que ya se selló no cambia. El código no se recalcula por esta plantilla. |
| F9 | En Soporte, la pregunta del reloj. El diagnóstico trae la guía. | El texto dice que la hora de red, con ubicación buena, es un aviso. La guía es `soporte.v6`. |
