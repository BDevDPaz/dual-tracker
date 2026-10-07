# Auditoría — varios destinos y pago del desplazamiento

Commit de partida: `d97bd67`. Política de nómina vigente: `CA_DAILY8_WEEKLY40_v2`.

Esto no es un dictamen legal. Donde la regla es un criterio de asesoría, se deja escrito y no se inventa otra ley.

## 1. Varios destinos

### Qué hay

Una jornada es **una** sesión. El campo `siteId` es el sitio en el que quedó fichada (el último). Los anteriores están en `transitSegments[]` (`fromSiteId` → `toSiteId`).

Flujo real:

1. **Iniciar jornada** elige el primer destino y pasa a `ESPERANDO`. La geocerca vigila solo ese sitio (`GeofenceRuntimeService.startMonitoring`).
2. Un ENTER fiable hace check-in (`ACTIVA`). Un ENTER con mala precisión no ficha: queda para una persona.
3. Al salir, tras el debounce (~2 min) y muestras fuera del radio, el estado es `SALIDA`. No se cierra solo. El hub ofrece: sigo aquí, almuerzo, traslado o cerrar. La hora de fin, si cierras, es la **primera** salida.
4. **Iniciar traslado** exige otro destino activo. Nace un tramo. La geocerca **cambia** al destino (deja de vigilar el origen). Si venías de `SALIDA`, el tramo empieza en la primera salida.
5. Llegar cierra el tramo, pone `siteId` en el destino y vuelve a `ACTIVA`.
6. Cancelar el traslado marca el tramo `cancelled`. Ese tiempo no es una línea de tránsito: cuenta como trabajo en el sitio de origen.
7. `RESOLVE_SPLIT` parte pausas, almuerzo, tránsito y hechos espaciales. El ledger escribe dos asientos.
8. Si el sistema mata la app, `OS_KILL` solo anota el ledger (no duplica la jornada) y al arrancar se vuelve a armar la geocerca del destino en curso.
9. Archivar un destino no borra historial. No se puede elegir un destino archivado para un traslado nuevo. La jornada que ya lo usa sigue.

Hoy muestra **Destinos de hoy** cuando hay más de un sitio (`app/(tabs)/index.tsx`). Historial, ficha del destino, estado de nómina y PDF leen la misma sesión.

### Defectos que se corrigieron

| Qué fallaba | Dónde | Gravedad |
| --- | --- | --- |
| Al llegar al segundo sitio, `siteId` pasaba a ser ese sitio y «Destinos de hoy» **dejaba de listar el primero**. Con un solo traslado la sección desaparecía justo cuando el día había salido bien. | `selectTodaySummary` | Alta |
| La ficha y la «última visita» solo miraban `siteId`. El origen de un traslado no contaba. | `selectSiteLastVisitAtMs`, `sites/[id].tsx` | Alta |
| Historial, detalle y PDF mostraban solo el último sitio. | `SessionListItem`, `session/[id].tsx`, `reportTemplates.ts` | Alta |
| En `ESPERANDO` y `TRASLADO` no había botón de **Confirmar llegada**, aunque la máquina y el texto ya existían. Si ya estabas dentro (o las dos geocercas se pisan), Android no manda ENTER y la jornada no avanzaba. | `getSessionStateUI` | Alta |
| Un ENTER al destino se ignoraba si quedaba una salida pendiente del sitio anterior. | `GeofenceRuntimeService` | Alta |
| **Iniciar almuerzo** en el aviso de salida se rechazaba (`LUNCH_START` solo valía en `ACTIVA`). | `sessionMachine` | Alta |
| `RESOLVE_SPLIT` dejaba las dos mitades con el `siteId` final. La primera mitad, si el traslado era después del corte, perdía el origen. | `splitSession` | Media |
| Cambiar radio o coordenadas del sitio vigilado no rearma la geocerca hasta la siguiente transición. | `intentRouter` | Media |
| Después de medianoche, «Destinos de hoy» usaba la fecha de pared y soltaba la jornada abierta (su fecha es la del inicio). | `selectTodaySummary` | Media |

### Qué no se cambió (decisión de producto)

- **Horas y dinero por cliente o por sitio.** La nómina es de la jornada, no un recibo por destino. La cadena «A → B» se ve; los minutos no se parten por obra. Recomendación: dejarlo así hasta que haga falta facturar por cliente. Partir por tiempo en el radio es otro producto (y se solapa con el traslado).
- **Una sola geocerca a la vez.** No se vigilan A y B juntos. Si se solapan, el camino es confirmar la llegada a mano. Recomendación: no registrar varias regiones del sistema en esta pasada.
- **Cerrar el día en pleno traslado** paga el tramo hasta el cierre y **no** marca el destino como visitado (no llegaste). El origen sigue siendo el sitio de la jornada.
- **`OS_KILL` no baja la clase de integridad.** Sigue siendo solo un asiento, como ya decía el código.
- **`clientId` no cambia al llegar** a otro destino. Sigue el del inicio.
- El campo `sites.lastVisitAtMs` que rellena el SQL al listar sigue mirando solo `sessions.site_id`. La pantalla usa el selector, que ya cuenta origen y llegadas.

## 2. Pago del desplazamiento

### Qué hay

`TransitPolicyService` separa el trayecto del tiempo en sitio. Lo decide la política de empresa, no una pantalla:

| Campo | Defecto de fábrica | Efecto |
| --- | --- | --- |
| `transitPaid` | `true` | El tramo entre sitios es hora pagada. |
| `transitRateMultiplier` | `1` | Misma tarifa que la hora normal. |
| `transitCountsTowardOvertime` | `true` | Esos minutos gastan primero la cubeta de 8 h diarias y de 40 h semanales. |

No hay mínimo ni máximo. Cada tramo se redondea al minuto (`Math.round`; 30 s suben a 1 min). Un tramo cancelado paga 0. El tramo abierto, en el estimado, cuenta hasta ahora.

En el estado de nómina sale una línea `TRANSIT`. No se mezcla con la línea regular. El almuerzo y las pausas se restan del tiempo en sitio; no se pueden iniciar en `TRASLADO` (hay que estar en sitio, o en la salida para el almuerzo).

El camino **de casa al primer destino no es un tramo**. Solo existe traslado después de haber fichado en un sitio. Eso coincide con la regla general de California (el commute no se paga; el viaje entre obras, en la jornada, sí). Los casos especiales de commute (vehículo de la empresa, herramientas, etc.) no están modelados.

Interpretación ya escrita en `PayrollEngineService`: el tránsito que cuenta para extra **consume** la hora regular, y el tránsito se paga en su propia línea a su tarifa. Con multiplicador 1, un día de 8 h en sitio + 0,5 h de camino paga lo mismo que 8 h normales + 0,5 h extra. El extra aparece en la línea de trabajo, no en la de tránsito.

### Defectos que se corrigieron

| Qué fallaba | Dónde | Gravedad |
| --- | --- | --- |
| El comentario decía que la decisión se congelaba al cerrar el tramo, pero `paid` se quedaba en `null` y un cambio posterior de `transitPaid` reescribía días viejos. | `closeOpenSegment`, `TransitPolicyService.decide` | Alta (nómina) |
| Un `MANUAL_PATCH` recortaba almuerzo y pausas, no el tránsito. Minutos fuera de la jornada nueva seguían pagándose. | `clipTransits` + `boundedMinutes` | Alta (nómina) |
| Lo mismo si el tramo guardado sobresale de la jornada: el motor ahora solo cuenta el trozo interior y avisa `TRANSIT_CLIPPED`. | `computeSessionMinutes`, `segmentation` | Alta (nómina) |

El corte queda en el asiento `MANUAL_PATCH` (`clippedTransits`). No se toca el hash ni la cadena del ledger.

Con la política v2, un trayecto que cruza la medianoche se parte en las dos jornadas (regresión nueva en `policyV2.test.ts`).

### Decisiones abiertas

1. **¿El propio trayecto cobra el recargo de extra cuando el día es casi todo camino?** Hoy, si hay 10 h solo de traslado, las 10 se pagan a ×1. El recargo de la hora 9 y 10 solo aparece si hay tiempo en sitio que el trayecto empuja por encima de 8 h. Con ×1 y bastante tiempo en sitio, el total coincide con «todo cuenta para el extra». Recomendación: no cambiar el motor. Si asesoría quiere el recargo **en la línea de tránsito** cuando el trayecto mismo pasa de 8 h o de 40 h, hace falta una bandera en `payrollLegalFlags` (por defecto, el comportamiento actual). No hay mínimo legal nuevo que inventar aquí.
2. **Esos tres interruptores no están en Ajustes.** Solo viven en `CompanyPolicy`. Recomendación: dejarlos como están (pagado, ×1, cuenta para extra) hasta que quieras apagar el pago del camino para una empresa. No hace falta pantalla nueva para probar en el S22+.
3. **Reglas por par de obras o por kilómetros.** El código las marca como TODO. Recomendación: no añadirlas.
4. **Doble tiempo (>12 h) y séptimo día** siguen apagados (`caDoubleTime`, `caSeventhDay`) hasta que asesoría diga lo contrario. El tránsito que cuenta para extra entra en esas cubetas igual que el resto de minutos que cuentan, pero el recargo, si algún día se enciende, sale en las líneas de trabajo, no infla la tarifa del tránsito. Misma pregunta que el punto 1.

## Cómo comprobarlo en código

`npm test -- --runInBand --watchman=false`, `npm run gm` y `npm run check:dates`. En el teléfono: [PRUEBAS_MULTI_DESTINO.md](PRUEBAS_MULTI_DESTINO.md).
