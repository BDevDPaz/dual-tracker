# Auditoría — cálculos y operación

Partida: `dc332bd` en `main` (PRs #1–#4 ya fusionados). Política de los comprobantes reales: `CA_DAILY8_WEEKLY40_v2`, semana laboral de lunes a domingo, jornada a las 00:00, tarifa $35/h. Esto no es un dictamen legal. Donde la regla es de producto o de asesoría, queda como pregunta.

No se tocó la detección de geocerca, la ubicación ni el arranque de sesión. Los PDF ya sellados no se regeneran. La cadena del ledger (hash de cada asiento y el enlace con el anterior) no cambia de algoritmo.

## Cómo se leyó

Tres comprobantes sellados:

| Periodo | Fila que importa | Pack | Sello |
| --- | --- | --- | --- |
| 12–18 oct 2026 | dom 18 oct, 18144 Burbank Blvd (Tarzana), 07:50 PM – 12:25 AM, 4.17 h, $145.83 | `efb42871…` / `W2026-10-12-90cb746b` | lun 19 oct 2026 12:26 AM |
| 19–25 oct 2026 | la misma fila de horario, 0.42 h, $14.58 | `41b78060…` / `W2026-10-19-9a8b2231` | lun 19 oct 2026 12:26 AM |
| 5–11 oct 2026 | nota «Desde El Salvador» y la bandera en la línea de abajo | `af1854cb…` | dom 18 oct 2026 07:06 PM |

La semana del 12–18 suma 5.12 h regulares y $179.08. Las filas son 0.00 + 0.10 + 0.57 + 0.28 + 0.00 + 4.17. Dos de ellas duran 0.00 h (04:45–04:45 cierre automático; 07:48–07:48 validada).

## 1. El corte de medianoche se calculaba bien y se enseñaba mal

**Gravedad: alta.** Trazabilidad.

Los minutos sí se parten. 19:50–00:00 son 250 min (4 h 10 min) y 00:00–00:25 son 25 min. A $35: $145.83 y $14.58. Suman $160.41, que es 4 h 35 min. El motor (`PayrollEngineService.buildStatement`, segmentos con `startMs` dentro del periodo) ya hacía eso con v2.

Lo que fallaba era la fila del documento y de las listas. `reportTemplates.sessionRows` pintaba la fecha y el reloj de la jornada entera en las dos semanas. Historial y Reportes usaban la sesión completa, así que el resumen semanal contaba otra vez los 25 min del lunes dentro de la semana del domingo. El detalle de la sesión solo pedía las líneas de la semana de entrada, y la continuación no aparecía.

**Arreglo.** `periodSliceOf` dice qué reloj corresponde a cada periodo. Cada fila dice, por ejemplo, `dom, 18 oct 2026`, `07:50 PM - 12:00 AM` y «continúa el lun, 19 oct 2026»; la semana siguiente, `lun, 19 oct 2026`, `12:00 AM - 12:25 AM` y «continúa de dom, 18 oct 2026». El mismo texto va al comprobante del empleado y al expediente del empleador. Historial (filtro de semana), Reportes y la lista del pack sellado usan esa porción. El detalle carga las líneas de cada semana que toca la jornada.

Los PDF que ya están en `documents/packs/` siguen con el horario largo. Un sello nuevo escribe el formato nuevo. El archivo viejo no se reescribe.

## 2. Jornadas de duración cero

**Gravedad: media.** Nómina $0; la duda es qué se muestra y qué se puede tirar.

En el comprobante del 12–18 hay seis sesiones el domingo y dos duran cero minutos de reloj: 04:45 PM – 04:45 PM (cierre automático) y 07:48 PM – 07:48 PM (validada). A la tarifa que sea, el pago es $0. No son un error de suma: 0+6+34+17+0+250 = 307 min = 5.12 h.

**Qué se hizo (lo que está claro).** Se quedan en el comprobante y en el expediente, con la nota «Duración cero: no suma al pago. Conservada para auditoría.» Historial y el detalle muestran el mismo aviso. Borrarlas sigue siendo el borrado lógico que ya existía (`DELETE_SESSION`, solo si está cerrada): el ledger anota `SOFT_DELETE` y la fila sale del cálculo. No se borran solas. No se marcan `CONFLICT` por durar cero. No se añade un aviso al statement: eso cambiaría el `contentHash` de una nómina que por lo demás es la misma.

**Pregunta.** ¿El comprobante del empleado debería omitir las filas de $0 y dejar una línea de que se omitieron, y el expediente del empleador conservarlas todas? Recomendación: sí, cuando se decida, porque el recibo se lee como pago y el expediente como rastro. Hasta entonces las dos copias muestran lo mismo.

## 3. Redondeo: filas, total y el reloj

**Gravedad: media.** En esta semana concreta los números ya cuadraban; el criterio no estaba escrito y en otras semanas las centésimas no cuadran.

Regla que usa el motor, y que ahora queda explícita:

- El tiempo real es el epoch (ms). Cada tramo redondea al minuto más cercano, acumulado, de modo que la suma de los tramos es el redondeo del total (`segmentation.cumulativeMinutes`).
- Cada línea de pago es centavos enteros: `round(minutos × tarifaEnCentavos / 60)`. El bruto es la suma de esas líneas, no un float de horas × tarifa. $179.08 son 17 908 centavos: 0 + 350 + 1 983 + 992 + 0 + 14 583.
- Las horas del documento son centésimas. Cada fila se redondea y el resto se reparte (resto mayor) para que la suma de las filas sea el redondeo del total de minutos. Tres filas de 1 min ya no pueden verse como 0.02+0.02+0.02 cuando el total es 0.05.
- El reloj de la fila es `HH:mm` (trunca los segundos). Por eso 06:23–06:56 puede ser 33 min de reloj y 34 min pagados si el cierre cayó a los 40 s: 34/60 = 0.57 h y `round(34 × 3500 / 60) = 1983` centavos = $19.83. La celda de horas ahora lleva también los minutos enteros (`34 min`), que son la cifra que entra a la nómina.

La semana de Byron, con redondeo independiente, ya sumaba 5.12. El reparto no le cambia las filas. Sirve para las semanas en que el half-up de cada fila no suma el half-up del total.

Los PDF viejos guardan el JSON del statement de entonces. Verificar un pack compara esos bytes; no vuelve a correr el motor.

## 4. Destino sin alias, o con un alias que no dice el lugar

**Gravedad: baja** en el PDF; el dato «Apt.» sigue siendo corto en la lista.

Si el alias está vacío, se muestra la dirección. Si alias y dirección son el mismo texto (el alta rápida guarda la dirección como alias), se muestra una sola vez. Si difieren, el PDF pone el alias y debajo la dirección. La lista (Historial, Reportes) sigue con el alias, para que una cadena `Obra Norte → Obra Sur` no se llene de calles.

Por eso «604 W Huntington Dr, Monrovia, CA 91016» y «18144 Burbank Blvd, Tarzana, CA 91356» aparecen tal cual: es el texto guardado como nombre, no un fallo de respaldo. «Apt.» es un alias corto. Si en el destino hay una dirección distinta, el PDF nuevo la pone debajo. Si no hay dirección, la lista y el PDF siguen diciendo solo «Apt.».

## 5. La bandera de la nota bajaba de línea

**Gravedad: media.** El texto guardado estaba bien; el PDF no.

La nota del 5–11 oct es `Desde El Salvador 🇸🇻` con espacios al final. WebKit partía la bandera (dos indicadores regionales) y `white-space` dejaba esos espacios dentro de las comillas.

**Arreglo.** Al pintar se recortan los bordes y un salto o varios espacios justo antes del emoji pasan a un solo espacio, con uniones de palabra (U+2060) para que no se corte. El emoji va en un `span` que no parte. La nota guardada no se modifica. `ADD_NOTE` y `MANUAL_PATCH` ya recortan al guardar. El PDF nuevo sigue en español, igual que el resto de los documentos (`docs/IDIOMA.md`).

## 6. Sello a las 12:26, semana cruzada y un arreglo posterior

**Gravedad: media.** El sello de la semana cerrada es válido; el de la semana que acaba de empezar no es el cierre.

Los dos packs se sellaron el lun 19 oct 2026 a las 12:26 AM, un minuto después del cierre (12:25).

- La semana 12–18 termina el dom 18 oct a las 23:59:59.999. El sello es **después** de ese fin. No es un sello anticipado. Si nadie edita esa jornada, ese pack es el cierre de esa semana.
- La semana 19–25 termina el dom 25 oct. El mismo instante es **antes** del fin. El pack es un anticipo: faltan los días 19–25. Reportes y la ficha del pack avisan cuando `sealedAtMs <= periodEnd`. No se bloquea el sello: la pantalla ya dejaba sellar la semana en curso, y cortarlo cambiaría un flujo que se usa a propósito.

Si después se edita la jornada que cruza (o cualquier asiento de esas sesiones), el `contentHash` cambia. Un sello nuevo crea otro pack. `reissue: true` también crea otro pack aunque el contenido sea el mismo. Sin eso, el segundo sello con el mismo `contentHash` reutiliza el pack y no escribe otro PDF ni otro asiento. El pack anterior se verifica con sus propios bytes; no se reescribe.

**Hueco que sí se corrigió.** El resumen de evidencia filtraba el ledger por la ventana del periodo. El pack del lunes no llevaba el check-in del domingo, y el del domingo no llevaba el cierre del lunes. Ahora entran todos los asientos de las sesiones incluidas en ese statement (sin duplicar por id). El `contentHash` cubre esa lista.

Consecuencia: los dos packs ya sellados de Byron, si se vuelven a comparar con el cálculo de ahora, salen como desactualizados aunque nadie edite las horas. La diferencia es la evidencia (faltaba el asiento del otro lado de la medianoche), no los 250 ni los 25 min. El aviso de Reportes lo dice. Generar de nuevo produce un código nuevo; el PDF y el hash viejos siguen guardados. A partir de ese segundo sello, si no hay otro cambio, el siguiente sello reutiliza el pack.

## Lo que se revisó y cuadra

| Tema | Resultado |
| --- | --- |
| OT diaria 8 h y semanal 40 h, v2 por segmento de jornada | Los tests de `policyV2` y `caRules` siguen verdes. El tránsito a 1× consume cupo de OT y no lleva recargo en la línea `TRANSIT` (`allocate` en `PayrollEngineService`). Byron ya aceptó esa regla; no se tocó. |
| Almuerzo y pausas | Se descuentan en el segmento donde caen. Si cruzan el límite, se parten con el mismo redondeo acumulado. |
| Corte de semana y de medianoche | 22:00–02:00 → 2 h + 2 h. El caso real 19:50–00:25 → 250 + 25 min. |
| DST, 1 nov 2026 | 01:00 PDT → 02:00 PST son 120 min reales y 120 min pagados. El epoch no se confunde. 22:00–06:00 en la noche del cambio de otoño sigue siendo 9 h; en primavera, 7 h. |
| `MANUAL_PATCH` | Exige nota, marca `MANUAL`, guarda el original y deja asiento. Un parche después del sello no reutiliza el pack (test de expediente). |
| Centavos | Líneas y bruto en centavos enteros. Los tests de nómina existentes siguen con los mismos dólares en tarifas enteras. |
| Idempotencia del sello | Mismo `contentHash` → mismo pack. `reissue` → pack nuevo, mismo contenido, otro `packHash`. |
| Cadena del ledger | Se verifica antes de sellar. Un pack alterado falla `CONTENT_HASH` / `PACK_HASH`. Los asientos de sello no entran al `contentHash`. |
| Muerte del proceso | `recordOsKill` anota `OS_KILL` con el mismo estado de la sesión. No mueve `endAtMs` ni duplica la jornada (`SessionEngineService`, `boot.ts`). |
| Historial, Reportes, PDF y ledger | La semana usa el mismo statement que el PDF para las jornadas cerradas. El detalle suma los centavos de las líneas con la misma fórmula, no rehaciendo el float. |

Doble tiempo por encima de 12 h y el séptimo día seguido están declarados en v2 y **apagados** salvo `payrollLegalFlags.caDoubleTime` / `caSeventhDay`. Siguen apagados.

## Preguntas (no se inventó una respuesta legal)

1. **Filas de $0 en el recibo del empleado.** Recomendación: omitirlas del comprobante, con una línea de que se omitieron, y dejarlas en el expediente. Hoy están en los dos.
2. **Minuto más cercano frente a pagar los segundos.** Recomendación: dejar el minuto más cercano, que es lo que ya corre, y enseñar los minutos enteros al lado del reloj (ya está). Cambiar a segundos o a truncar hacia abajo movería $19.83 y cualquier semana ya sellada no se reescribe, pero los sellos nuevos no coincidirían con el hábito actual.
3. **¿Se puede sellar una semana que no ha terminado?** Recomendación: seguir pudiendo, con el aviso de que no es el cierre. Prohibirlo evita el pack del 19–25 sellado a las 12:26, y también impide el comprobante de una semana en curso que hoy se puede pedir.
4. **Hora repetida del cambio de otoño.** 01:30 existe dos veces. Una sesión guardada en epoch está bien. Un alta o un parche escrito solo como `HH:mm` no puede decir cuál de las dos es. Recomendación: no inventar un selector hasta que alguien edite una jornada en esa hora; el cálculo por epoch ya es el correcto.
5. **Doble tiempo y séptimo día.** Siguen detrás de las banderas, en off. Recomendación: confirmar con asesoría antes de encenderlas. No se activaron.
6. **Tránsito a 1×, cuenta para el cupo, sin recargo en la línea.** Ya aceptado. No se cambió. Si la asesoría pide otro multiplicador, es un cambio de política versionado, no un parche de este cálculo.
7. **Alias «Apt.» en la lista.** El PDF ya añade la dirección. La lista no, para no alargar la cadena de destinos. Recomendación: si el alias tiene menos de unos pocos caracteres y hay dirección distinta, enseñarla también en la lista. No se hizo: es de presentación y puede ensuciar el caso de dos obras.

## Qué se tocó

- `src/services/domain/payrollDisplay.ts` — centavos, centésimas, nota, alias.
- `src/services/domain/periodSlice.ts` — reloj de la porción.
- `src/services/domain/PayrollEngineService.ts` — bruto = suma de centavos.
- `src/services/domain/IntegrityLedgerService.ts` — asientos de la sesión aunque caigan fuera de la ventana.
- `src/services/evidence/EvidencePackService.ts` — `describeFreshness` (no escribe ni sella).
- `src/services/evidence/reportTemplates.ts` — filas, emoji, minutos, dirección.
- Selectores, Historial, Reportes, detalle, estado de nómina y ficha del pack.
- Tests de regresión y `scripts/check-dates.ts` (01:00–02:00 del 1 nov 2026 = 120 min).

## Pruebas

- `npx jest --runInBand --watchman=false` — 75 suites, 580 tests.
- `npm run gm` — typecheck, lint, tests de dominio y `expo-doctor` (18/18).
- `npm run check:dates` — 119 comprobaciones, Node + Intl.
