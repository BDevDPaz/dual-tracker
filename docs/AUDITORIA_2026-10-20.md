# Auditoría 2026-10-20

Lectura del código en `main` (`4c7e289`, merge del PR #19). Expo SDK 54, React Native 0.81.5, Hermes. La primera pasada fue de solo lectura: los hallazgos de abajo se redactaron sobre ese árbol y se conservan. Este mismo PR corrige A1, A2, A3, A4, A6, A7, A8, A9 y A10. A5 queda pendiente. Esto no es un dictamen legal: donde la regla es de producto o de asesoría, queda dicho.

El objetivo era un error real, con reproducción, en nómina de California, integridad del ledger y de los expedientes, fechas, geocerca y máquina de sesión, SQLite, i18n y seguridad. Los hallazgos ya cerrados en `docs/AUDITORIA_CALCULOS_Y_OPERACION.md` y `docs/AUDITORIA_DESTINOS_Y_TRASLADO.md` no se repiten.

No hay hallazgo de gravedad crítica. Hay cinco altos, tres medios y dos bajos.

## Cómo se comprobó

En el árbol de `4c7e289`, antes de cualquier archivo de esta auditoría:

| Comando | Resultado |
| --- | --- |
| `npx jest --runInBand --watchman=false` | 103 suites, 788 tests, 2 snapshots, todo en verde (~43 s) |
| `npm run check:dates` | 119 pruebas, 0 fallos (Node + Intl) |
| `npx expo-doctor` | 18/18 |

En el mismo árbol, ya sin el archivo de reproducción:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | limpio (dentro de `npm run gm`) |
| `npx expo lint` | limpio, sin avisos |
| `npm run gm` | typecheck + lint + `test:domain` (41 suites, 308 tests) + expo-doctor 18/18, código de salida 0 |

Los diez bugs de abajo se confirmaron con un test de Jest local (`src/services/domain/__tests__/auditRepro.2026-10-20.test.ts`, 11 casos, todos en verde). Ese archivo se borró. Cada repro se puede volver a armar con los helpers que ya existen (`test/time.ts`, `test/helpers.ts`, `seedWorld`, `mustDispatch`). La regresión permanente es `src/services/domain/__tests__/auditFixes.2026-10-20.test.ts`.

Después de la corrección, en este árbol:

| Comando | Resultado |
| --- | --- |
| `npx jest --runInBand --watchman=false` | 104 suites, 799 tests, 2 snapshots, todo en verde (~49 s) |
| `npm run check:dates` | 119 pruebas, 0 fallos |
| `npm run gm` | typecheck limpio, lint limpio, `test:domain` 42 suites / 319 tests, expo-doctor 18/18, código de salida 0 |

## Bugs confirmados

| Id | Gravedad | Estado |
| --- | --- | --- |
| A1 | Alto | Corregido |
| A2 | Alto | Corregido |
| A3 | Medio | Corregido |
| A4 | Alto | Corregido |
| A5 | Alto | Pendiente. Solo iOS, sin medición en un aparato. El código de `onForeground` no se tocó. |
| A6 | Alto | Corregido |
| A7 | Medio | Corregido |
| A8 | Medio | Corregido |
| A9 | Bajo | Corregido |
| A10 | Bajo | Corregido |

### A1. Un sello idempotente da por bueno un periodo cuyo ledger ya está roto

**Gravedad: alto.** Integridad del expediente.

`EvidencePackService.seal` verifica la cadena completa y, si no cuadra, guarda el incidente (`src/services/evidence/EvidencePackService.ts:326-328`). Después, si el `contentHash` del periodo coincide con el del último pack, devuelve ese pack con `ok: true` y `reused: true` (`:345-347`). El rechazo `LEDGER_BROKEN` está en la línea siguiente (`:350`) y no se alcanza.

`contentOf` (`:95-105`) ata el statement y, de cada asiento, solo `{ id, sessionId, hash }`. El `payload_json` no entra. `describeFreshness` (`:309`) declara `matches` cuando ese `contentHash` coincide.

**Repro.** Sellar una semana cerrada. Soltar el trigger `trg_ledger_no_update`, añadir un espacio al `payload_json` de un asiento y dejar la columna `hash` igual. Volver a sellar el mismo periodo sin `reissue`. El segundo `seal` responde `{ ok: true, reused: true }`. El incidente queda grabado y `verify()` completo dice `valid: false`. `describeFreshness` sigue con `matches: true`.

**Impacto.** La pantalla de reportes, al recibir un pack, abre el expediente anterior (`app/(tabs)/reports.tsx:130`) y no muestra el aviso de pack desactualizado (`:208`, solo si `matches` es falso). El PDF reutilizado conserva las cifras de antes de la manipulación: el pago no se reescribe. Lo que se pierde es el bloqueo. El comentario de `integritySweep.task.ts:22-23` dice que una ruptura bloquea el sello; en el camino idempotente no lo hace. Quien revisa el teléfono ve un sello correcto mientras el incidente ya existe en `app_kv`.

**Arreglo propuesto.** Mirar el incidente (y el `valid` de la verificación que acaba de correr) antes del `return` de reutilización. `describeFreshness` no debería informar `matches: true` con un incidente abierto. Atar un digest del `payload_json` dentro de `contentHash` cambiaría el hash de los packs ya sellados; si se hace, tiene que ser una versión nueva del manifiesto, no un recálculo silencioso de los v4 existentes.

**Estado: corregido.** `seal` devuelve `LEDGER_BROKEN` antes de reutilizar el pack. `describeFreshness.matches` queda en falso mientras el incidente sigue abierto. `contentHash` sigue sin atar `payload_json`: un pack ya sellado verifica con el mismo hash.

### A2. `verify` acepta un manifiesto v4 reescrito si se le quita la firma

**Gravedad: alto.** Firma del expediente.

`EvidencePackService.verify` (`src/services/evidence/EvidencePackService.ts:475-478`) trata la firma como presente solo cuando `manifestVersion >= 4` y el campo `signature` existe. Si no está, el esquema es `unsigned-v1` y el pack es `valid` en cuanto los SHA-256 cuadran. `verifyCanonicalBody` (`src/services/evidence/packSignature.ts:100-107`) comprueba la firma con la clave pública que viaja dentro del propio pack. El `keyId` es el prefijo del SHA-256 de esa clave. El asiento `EMPLOYER_KEY_PINNED` (alta del PIN de administración) no se consulta en esta función.

Sellar sin llavero y marcar `PACK_UNSIGNED` es un estado previsto (`packSignature.ts:86-88`, `EvidencePackService.ts:357-359`). El agujero es otro: no hay un cierre que distinga «este dispositivo no pudo firmar» de «alguien rehízo los hashes y borró la firma», ni de «alguien firmó con una clave nueva».

**Repro.** Clonar un pack v4 sellado. Subir `regularHours` en 5, el bruto en 100 y los minutos y el importe de la primera línea. Recalcular `statementHash`, `evidenceHash`, `contentHash` y `packHash` con `sha256Hex(canonicalJson(packHashBody(...)))`. Borrar `signature`. `verify` devuelve `{ valid: true, legacy: false, scheme: "unsigned-v1", failures: [] }`. La misma función acepta una refirma con un par de claves nuevo, porque la pública va en el manifiesto.

**Impacto.** Un archivo `manifest_*.json` copiado fuera del teléfono se puede rehacer y seguir pasando la verificación que publica el propio servicio. El trigger de SQLite no protege ese archivo. El empleador que solo llama a `verify` no se entera.

**Arreglo propuesto.** La verificación del empleador tiene que exigir esquema Ed25519 y que `keyId` / `publicKey` sean los del pin `EMPLOYER_KEY_PINNED`. Un v4 que nació firmado y llega sin firma debe fallar. El sello sin llavero puede seguir existiendo, con `PACK_UNSIGNED` dentro del `packHash`, y la verificación tiene que negarse a tratar ese pack como equivalente a uno firmado por la clave del empleador.

**Estado: corregido, con el pin de la clave que realmente firma los packs.** Esa clave vive en el slot `dt.packsig.ed25519.v1`, fuera de SQLite. La clave `EMPLOYER_KEY_PINNED` firma el código de aprovisionamiento, no el manifiesto: exigirla rechazaría todo pack ya sellado en el dispositivo. Un v4 sin firma y sin `PACK_UNSIGNED` falla con `SIGNATURE_MISSING`. Si el llavero tiene pin y la pública o el `keyId` del manifiesto no coinciden, falla `SIGNATURE_KEY`. Un pack firmado con esa clave pinada sigue verificando. Un sello con `PACK_UNSIGNED` y los manifiestos v1–v3 siguen en `unsigned-v1` cuando los hashes cuadran. `packHash` y `contentHash` no cambian de composición. Si el llavero no se puede leer, la comprobación del pin no tiene contra qué comparar: la firma criptográfica del cuerpo sigue exigiéndose.

### A3. La verificación incremental no vuelve a mirar el prefijo ya marcado

**Gravedad: medio.** Cadena de hashes en el arranque.

`verifyIncremental` (`src/services/domain/IntegrityLedgerService.ts:245-252`) lee `ledger.verified_through` y solo pasa a `verifySegments` los asientos con `id` posterior. El ancla se acepta por el hash guardado en KV. `markVerified` (`:256-258`) guarda el último asiento cuando una verificación completa sale válida. El arranque usa el modo incremental (`src/core/boot.ts:124`). El barrido diario sí hace la verificación completa (`src/services/runtime/tasks/integritySweep.task.ts:24`).

Los triggers `trg_ledger_no_update` y `trg_ledger_no_delete` (`src/services/persistence/schema.ts:105-110`) impiden el `UPDATE` con la app en marcha. El modelo de amenaza del ledger es precisamente una edición del archivo SQLite fuera de ese camino.

**Repro.** Verificación `FULL` sana, que deja `verified_through` en la cabeza. Alterar `payload_json` del primer asiento sin tocar `hash` (trigger desactivado, igual que en los tests del propio ledger). `checkLedgerIntegrity("INCREMENTAL")` devuelve `valid: true` e incidente `null`. La verificación completa del mismo momento devuelve `valid: false` y `brokenAtId` igual al id de ese primer asiento.

**Impacto.** Entre la edición y el próximo barrido completo, cada arranque ve la cadena sana. Combinado con A1, un resello del periodo ya sellado puede devolver el pack viejo aun después de que el `verify()` completo de `seal` haya anotado el incidente. Un periodo nuevo, sin pack previo, sí cae en `LEDGER_BROKEN` porque no entra por el `return` de reutilización.

**Arreglo propuesto.** El incremental debe recomprobar al menos el asiento ancla (recalcular su hash desde `payload_json` y `prevHash`). Otra opción es un `FULL` en cada arranque: la cadena de un dispositivo cabe en esa pasada. No marcar `verified_through` por encima de un prefijo que no se ha releído.

**Estado: corregido.** `verifyIncremental` vuelve a hashear el prefijo hasta el ancla. Si el ancla falta o su `hash` no es el de `verified_through`, cae a la verificación completa. La cola se mira solo cuando ese prefijo cuadra. Un reconocimiento de ruptura que ya estaba en el prefijo sigue contando.

### A4. El cierre automático puede guardar un fin de jornada que todavía no ha llegado

**Gravedad: alto.** Horas pagables y guarda de tiempo futuro.

`CLOSE_DAY` rechaza un fin posterior al techo (`src/services/domain/sessionMachine.ts:695-697`). `AUTO_CLOSE` asigna `endMs = firstExitAtMs` y no llama a `future()` (`:754-787`, causas `EXIT_DECISION_EXPIRED`, `ABANDONMENT_CONFIRMED`, `MAX_OPEN_12H` y `PROVIDER_LOSS`). `newFutureInstants` (`src/services/domain/sessionTimeGuard.ts:63-66`) deja pasar un instante que ya estaba guardado por encima del techo. `firstExitAtMs` ya estaba en la sesión, así que copiarlo a `endAtMs` no cuenta como instante nuevo y la persistencia lo escribe.

El temporizador de decisión de salida dispara ese `AUTO_CLOSE` al vencer el plazo (`src/services/runtime/tasks/exitDecisionTimer.task.ts:48-50`).

**Repro.** Jornada activa, dos horas de reloj de prueba, `reanchor`, salto de pared de +30 min, `EXIT_DETECTED` en ese instante, salto de pared de −30 min y otro `reanchor`. `firstExitAtMs` queda por encima de `futureCeiling()`. `CLOSE_DAY` responde `FUTURE_TIME`. `AUTO_CLOSE` con causa `EXIT_DECISION_EXPIRED` y `confirmedOutside: false` (lo que manda el watchdog cuando la zona no es `outside`) persiste `endAtMs === firstExitAtMs`, todavía por encima del techo.

**Impacto.** Esos minutos entran en la nómina en cuanto el reloj real los alcanza. `seal` rechaza `SESSION_ENDS_AFTER_SEAL` mientras `endAtMs` supere el techo (`EvidencePackService.ts:337-341`) y, pasado ese momento, los paga. El cierre manual del mismo hecho sí se niega.

**Arreglo propuesto.** `AUTO_CLOSE` debe aplicar `future(endMs)` y rechazar o recortar al techo. La persistencia no debería tratar como heredado un instante que se copia a `endAtMs` cuando `endAtMs` anterior era `null`.

**Estado: corregido.** `AUTO_CLOSE` recorta `endMs` al techo de tiempo futuro. Si ese techo no queda después del inicio, rechaza `FUTURE_TIME`. `newFutureInstants` distingue el campo (`endAtMs` frente a `firstExitAtMs`): copiar la salida a un fin que era `null` es un instante nuevo y el repositorio lo rechaza si todavía es futuro. `firstExitAtMs` puede seguir en el registro. La nómina de la jornada cerrada usa `endAtMs`.

### A5. Al volver a primer plano se mide la deriva antes de reanclar

**Gravedad: alto.** Clasificación de la jornada. Confirmado contra el modelo de reloj del proyecto y contra el comentario del propio servicio. No se midió en un iPhone ni en un Android físico.

`TimeAuthorityService.reanchor` documenta que en iOS el reloj monótono de JS no avanza con el aparato dormido y que la medición solo vale dentro de una ventana en primer plano (`src/services/evidence/TimeAuthorityService.ts:121-127`). `onForeground` hace lo contrario: lee `isDriftExceeded()` y, si hay sesión abierta, despacha `INTEGRITY_DEGRADE` / `CLOCK_DRIFT`, y reancla después (`src/core/boot.ts:151-155`). El umbral es 3 minutos (`src/config/provisional.ts:163-168`). `ok()` escala a `CONFLICT` cualquier transición de una sesión abierta mientras `degradedReason` está puesto (`sessionMachine.ts:211-220`).

**Repro.** Con el reloj de `test/time.ts`: una hora de `travel` (pared y monótono juntos), `reanchor`, `jumpWall(+10 min)`. `isDriftExceeded()` es verdadero y `currentDriftMs` es 10 minutos. `CLOSE_DAY` cierra en `CONFLICT` / `CLOCK_DRIFT`. Un `reanchor` posterior deja `isDriftExceeded()` en falso, pero la clase de la sesión no vuelve atrás.

**Impacto.** Si el comentario de iOS describe el aparato, cada regreso a primer plano después de más de 3 minutos con la pantalla apagada marca la jornada abierta como revisión por deriva, y el reanclaje de la línea 155 solo limpia la medición para la próxima vez. El TODO de `TimeAuthorityService.ts:125` ya nombra `elapsedRealtime` (Android) y un uptime que incluya el sueño (iOS). En Android el servicio en primer plano puede mantener el proceso despierto; ese caso no se afirma aquí.

**Arreglo propuesto.** Reanclar al entrar en primer plano y medir la deriva solo a partir de esa ancla, dentro de la ventana que el comentario ya define. La comparación de sueño real corresponde al reloj nativo que el TODO pide.

**Estado: pendiente.** No entra en este PR. `boot.ts` sigue midiendo `isDriftExceeded()` y reanclando después. No hay medición en un iPhone ni en un Android físico. La re-prueba de teléfono de más abajo no usa este caso como criterio de paso.

### A6. Una salida fiable se queda esperando en la banda de histéresis y la siguiente salida nativa se tira

**Gravedad: alto.** La jornada sigue abierta después de irse del sitio.

`confirmExitDecision` devuelve `"wait"` cuando el debounce ya venció (o hay strikes de sobra), la zona es `unknown`, no está «lejos» y la salida pendiente era fiable (`src/services/runtime/geofencePolicy.ts:83-87`). Ese `"wait"` está cubierto por `geofencePolicy.test.ts` como decisión de política. El fallo es lo que hace el runtime con ella.

`checkPendingExit` ante `"wait"` hace `return false` y no rearma el temporizador (`src/services/runtime/GeofenceRuntimeService.ts:716`). `armDebounceTimer` (`:649-654`) es un solo disparo. Mientras exista un pending de esa sesión, un `EXIT` nativo nuevo se descarta con motivo `ANTI_REBOUNCE` (`:595-606`). `observeSample` solo suma strikes si la zona es `outside` (`:813-816`) y solo limpia el pending si la decisión pasa a `"clear"` (zona `inside`, o dwell corto). Una muestra en la banda muerta no mueve nada.

**Repro.** Sesión activa en el sitio de las fixtures (radio 100 m) con más de 90 s de permanencia. Posición a ~122 m (`SITE_LAT + 0.0011`), precisión 10 m: la zona sale `unknown` (fuera del radio, dentro de radio + histéresis de 50 m). Pending con `reliable: true`, 3 strikes y `firstExitAtMs` tres minutos atrás (el debounce por defecto es 2 min). `checkPendingExit` devuelve `false`, el estado sigue `ACTIVA` y el pending sigue. Un evento nativo `Exit` de la región `SESSION_{id}_SITE_{siteId}` tampoco cierra: `endAtMs` queda `null` y el pending permanece.

**Impacto.** Las horas siguen corriendo después de una salida real hasta que llegue un fix claramente dentro o claramente fuera, o hasta el watchdog de 12 h. Si `firstExitAtMs` nunca se confirma, ese watchdog paga hasta el tope de 12 h (`sessionMachine.ts:771-775` usa `firstExitAtMs` solo cuando ya está guardado en la sesión; el pending que nunca se promovió no lo está).

**Arreglo propuesto.** En `"wait"`, rearmar un temporizador. Un `EXIT` nativo posterior debe refrescar el hecho pendiente en lugar de descartarse. Una zona `unknown` después del debounce no puede bloquear el cierre de forma indefinida.

**Estado: corregido.** En `"wait"`, `checkPendingExit` vuelve a armar el temporizador de un disparo. Un `EXIT` nativo de la misma sesión refresca strikes y fiabilidad y vuelve a evaluar; el descarte de 5 s (`GEOFENCE_ANTI_REBOUNCE_MS`) sigue aplicando al primer evento, no a ese refresco. Zona `unknown` con salida fiable confirma cuando el tiempo llega a dos debounce (`EXIT_UNKNOWN_GIVE_UP_FACTOR`). A un debounce de 120 s, 180 s sigue en espera y 240 s confirma. Esa confirmación en banda `unknown` pasa la jornada a `SALIDA`: el pago abierto se corta en `firstExitAtMs`.

### A7. El certificado que ve Reportes no es el que usa el sello

**Gravedad: medio.** Una semana con la cadena segmentada se muestra certificable y el agregado de varias semanas borra el `certified: false` de una de ellas.

`rollupIntegrity` apaga `certified` cuando hay una ruptura reconocida dentro del periodo (`src/services/domain/PayrollEngineService.ts:355`), y `buildStatement` solo lo sabe si le pasan `segmentedLedgerTimestamps` (`:388`). `assemblePeriod`, que es el camino del sello, sí los pasa (`src/services/evidence/EvidencePackService.ts:191-195`). `previewPayroll` no (`src/services/application/useCases/generateWeeklyPayroll.ts:31-39`). Es el único llamador de `buildStatement` aparte del sello.

`combineWeekStatements` (`src/utils/reportRange.ts:103-130`) recalcula `certified` como `!hasConflict && blocked === 0`. Ignora el `certified` de cada semana. Suma `byClass` de todas las semanas, así que una sesión que aparece en dos semanas (corte de medianoche) cuenta dos veces en `VALID` / `MANUAL` / `AUTO` / `CONFLICT`, mientras `sessionIds` sí va por un `Set` (`:103`). El widget de una sola semana pinta `certified={!hasConflict}` (`app/(tabs)/reports.tsx:292`) y tampoco mira bloqueos ni segmentación. `FIELD_CRYPTO_UNAVAILABLE` no pone `CONFLICT`, así que el widget puede decir certificado mientras `seal` responde `PERIOD_NOT_CERTIFIABLE`.

**Repro.** No se plantó una ruptura real en la base. Se compararon los dos caminos con el mismo dato:

- `buildStatement` con `segmentedLedgerTimestamps` dentro del periodo deja `certified: false` y el aviso `LEDGER_CHAIN_SEGMENTED`.
- `previewPayroll` de esa semana no recibe el dato: `certified: true` y el aviso no está.
- `combineWeekStatements` de una semana con `certified: false` y otra con `certified: true`, las dos con la sesión 7, devuelve `certified: true`, `byClass.VALID === 2` y `sessionIds` igual a `[7]`.

**Impacto.** Reportes ofrece el botón de sellar (`reports.tsx:273-278`) con el statement del preview. El sello, al recalcular, rechaza el periodo o lo sella sin certificar. El contador VMAC de la pantalla solo se muestra en la semana única, así que el doble conteo de `byClass` puede no verse; el flag `certified` y el botón sí.

**Arreglo propuesto.** Pasar `segmentedLedgerTimestamps` en `previewPayroll` (y en el selector que arma la vista). `combineWeekStatements` debe exigir `certified` en cada semana y no sumar dos veces la misma sesión. El widget debe usar `statement.integrityRollup.certified`.

**Estado: corregido.** `previewPayroll` pasa los mismos timestamps segmentados que el sello y adjunta `sessionClasses`. Ese campo no entra en `statementHash` ni en `contentHash`. `combineWeekStatements` exige `certified` en cada semana. Si todas traen `sessionClasses`, `byClass` y `blocked` se arman por id de sesión. El widget de Reportes usa `integrityRollup.certified`.

### A8. Una pausa se etiqueta como almuerzo en la ficha y en el reporte

**Gravedad: medio.** El texto de la evidencia en la app. El PDF no tiene este fallo.

`tLineKind` mapea `PAUSE_DEDUCTION` a la clave `reports.lunch` (`src/i18n/index.ts:80`), la misma que `LUNCH_DEDUCTION`. En español `reports.lunch` es «Almuerzo»; en inglés, «Lunch». Lo usan el detalle de la sesión (`app/session/[id].tsx:168`) y el reporte del periodo (`app/report/[periodId].tsx:99`). El PDF usa `comprobante.linePause` (`src/services/evidence/reportPremium.ts:169`) y la plantilla de texto dice «Pausa (deducción)» (`src/services/evidence/reportTemplates.ts:121`).

**Repro.** `setLanguage("es")` y `tLineKind("PAUSE_DEDUCTION")` devuelve `"Almuerzo"`. En inglés devuelve `"Lunch"`. No existe `reports.pause`.

**Impacto.** En pantalla, el descanso y la comida salen con el mismo nombre. En California esa distinción importa para la evidencia que el operario enseña desde el teléfono. El comprobante PDF sí los separa, así que el expediente sellado y la app no dicen lo mismo.

**Arreglo propuesto.** Añadir `reports.pause` en `es.ts` y `en.ts` y apuntar `PAUSE_DEDUCTION` a esa clave.

**Estado: corregido.** `reports.pause` es «Pausa» en español y «Break» en inglés. `LUNCH_DEDUCTION` sigue en «Almuerzo» / «Lunch». El PDF ya usaba la clave correcta.

### A9. El tope del almuerzo fijo al guardar no resta las pausas

**Gravedad: bajo.** El pago de este caso concreto sale a cero por los dos caminos. Lo que no cuadra es el minuto guardado contra el minuto de la línea.

Al guardar, `fixedLunchExceedsSession` compara los minutos declarados con la duración de la jornada (`src/services/domain/sessionTimeGuard.ts:107-111`). `CLOSE_DAY` usa esa misma cuenta (`sessionMachine.ts:707`). La nómina capa con jornada menos pausas (`src/services/domain/segmentation.ts:74-77`, y `PayrollEngineService` al armar el almuerzo fijo).

**Repro.** Jornada de 60 min con 10 min de pausa y almuerzo fijo declarado de 55, sin hora de inicio. `fixedLunchExceedsSession` es falso y el cierre se guarda. `computeSegmentMinutes` deja almuerzo 50, pausa 10 y trabajo 0. 55 > 60 − 10, así que el libro dice 55 min descontados y la línea de nómina dice 50.

**Impacto.** No hay sobrepago: el trabajo ya está en cero. El expediente y la ficha pueden mostrar un descuento de almuerzo distinto del que entró al bruto. El tope de `c3233b8` (60 declarados sobre 36 min de jornada → 36 de almuerzo y 0 de trabajo) sigue bien; este caso es el que ese tope no ve porque la pausa no entra en la cuenta del guardado.

**Arreglo propuesto.** Usar el mismo tope (jornada menos pausas) al guardar, o persistir los minutos ya capados.

**Estado: corregido.** `fixedLunchExceedsSession` resta los minutos de pausa ya redondeados. Lo usan `CLOSE_DAY`, el parche manual, el fin de huérfana, el corte de sesión y el repositorio al insertar o actualizar. 55 min sobre 60 de jornada y 10 de pausa se rechaza. 50 min, que es justo el hueco, se guarda. El texto de `LUNCH_EXCEEDS_SESSION` dice que el almuerzo y las pausas tienen que caber en la jornada. La cadena del modal (`lunchMustFit`) no cambió.

### A10. El almuerzo fijo prorrateado se pierde en el primer tramo si ese tramo ya está en pausa

**Gravedad: bajo.** Dos minutos de más en un turno que cruza la medianoche, sin hora de almuerzo.

`prorate` reparte con `floor` y deja el resto en el primer segmento (`src/services/domain/segmentation.ts:80-88`). El almuerzo fijo de varios segmentos usa ese reparto (`:154-158`). `workMinutes` recorta a cero el tramo que no da más de sí (`:203`) y no pasa el descuento sobrante al tramo siguiente.

`CLOSE_DAY` con actor `USER` exige hora de inicio del almuerzo cuando la jornada cruza el límite del día (`sessionMachine.ts:720-721`). Este camino queda para datos viejos, para un cierre que no es del usuario y para un almuerzo fijo guardado sin intervalo.

**Repro.** Inicio `Date.UTC(2026, 8, 22, 6, 50)` (21 sep 2026, 23:50 en `America/Los_Angeles`, PDT). Pausa los primeros 10 min y fin 480 min después: duración 490. Almuerzo fijo de 60 min, sin reloj de comida. Los segmentos pesan 10 y 480. El prorrateo pone 2 min de almuerzo en el primero, que ya tiene 10 de pausa. Esos 2 se tiran. Trabajo 422. La cuenta jornada − almuerzo − pausa es 420. Diferencia: 2 min pagados de más.

**Impacto.** A la tarifa que esté cargada, son 2 min de regular (o de extra, si el día ya iba lleno). No es un error de tarifa ni de doble conteo del tránsito. Se repite en cualquier turno partido cuyo primer segmento sea más corto que la parte de almuerzo que el prorrateo le asigna encima de sus pausas.

**Arreglo propuesto.** Cuando un segmento no puede absorber lunch + pausa, arrastrar el descuento que no cupo al segmento siguiente antes de calcular `workMinutes`.

**Estado: corregido.** El almuerzo que no cabe (jornada del tramo menos pausa y tránsito) pasa al tramo siguiente. El último tramo conserva el total que le llega, así que una jornada de un solo segmento mantiene la misma línea de almuerzo. El repro de 490 min con 10 de pausa al inicio y 60 de almuerzo fijo queda en 420 de trabajo y 60 de almuerzo.

## Sospechas no confirmadas

No se armó un repro que las dejara en rojo. No van en la lista de arriba.

1. **`clipBreaks` reescribe `totalPausedMs` solo con las pausas que sobreviven al recorte** (`sessionMachine.ts:289-291`). Si `totalPausedMs` traía milisegundos que no están en el array `pauses`, ese resto desaparece en cuanto alguna pausa se recorta. No se ejecutó un caso que lo dejara mal en la nómina.

2. **Más de una sesión abierta.** No hay `UNIQUE` sobre sesiones abiertas. `getOpenSession` hace `ORDER BY declared_start_ms DESC LIMIT 1` (`PersistenceService.ts:405-409`). El camino normal es el mutex y `SESSION_ALREADY_OPEN`. Haría falta un bypass de ese mutex para ver si la segunda sesión se queda fuera de la geocerca y del watchdog.

3. **Revisión de huérfana con GPS desconocido.** `reviewAbandonedSession` solo perdona la jornada cuando `isCurrentlyOutside()` es `false` (`orphanSession.ts:33-35`). `null` (fix inútil o banda `unknown`, `GeofenceRuntimeService.ts:861-868`) sigue hacia `MARK_ORPHAN`. El comentario dice que un fix interior no es abandono. Puede ser la política querida: sin prueba de que sigue dentro, pasa a revisión y no se cierra sola. No se demostró un cierre con horas inventadas.

4. **Hora ambigua del cambio a horario estándar.** `fromWallClock` (`dateUtils.ts:219`) se queda con el offset mayor, que en el Pacífico es el primer tramo (PDT) de la hora que ocurre dos veces. Las sesiones guardadas en epoch no pasan por ahí. Es la misma pregunta de producto que ya dejó la auditoría anterior. `check:dates` sigue en verde, incluido el tramo real de 120 min del 1 nov 2026, 01:00–02:00.

5. **Un día que solo tiene tránsito y ese tránsito cuenta para la extra entra en los 7 días del séptimo día** (`PayrollEngineService.ts:181`, `workMinutes + transitOtMinutes`). La bandera `caSeventhDay` sale apagada. No se contrastó con el texto del Labor Code.

6. **`overtimeFirstMinutes` no se lee.** El séptimo día usa solo `doubleAfterMinutes` (`PayrollEngineService.ts:231-232`). En la política v2 los dos valen 480 (`payrollPolicies.ts:47`), así que hoy los primeros 8 h salen a 1,5× y el resto a 2×. Si alguien separa los dos campos, el código ignora el primero. El comentario de las líneas 228-230 describe un hueco que el código no implementa.

7. **`hour % 24` a medianoche** (`dateUtils.ts:166`). Si Intl devolviera la hora `"24"`, el día no avanza. En el Node de esta pasada `check:dates` no lo vio (119/119). Sigue siendo un supuesto del comentario, no un fallo medido.

## Revisado y cuadra

Esto se leyó y, con la suite existente más los repros de arriba, no salió un error.

- **Umbrales de California en v2.** Extra diaria a partir de 480 min a 1,5×. Extra semanal a partir de 2400 min, solo sobre el regular que todavía queda, sin pirámide con la diaria ni con el doble. 9 h de un día son 8 + 1. Doble tiempo, con la bandera encendida y `doubleTimeDailyAfterMinutes` en la política: 13 h son 8 regular + 4 extra + 1 doble. Con la bandera apagada, 8 + 5 extra y cero doble. Dos sesiones el mismo día acumulan. Las dos banderas (`caDoubleTime`, `caSeventhDay`) salen apagadas por defecto.
- **Séptimo día dentro de la semana laboral.** Siete `dayKey` distintos en la misma semana lunes–domingo: las primeras 8 h a extra y el exceso a doble, con regular en cero. Seis días no disparan. Una racha que cruza el domingo y el lunes de la semana siguiente no dispara. Eso coincide con el comentario de `PayrollEngineService.ts:173-176` y con la semana laboral del Labor Code 510. No es un bug.
- **Corte de medianoche v2.** 18:00–08:00 son 6 h + 8 h. Ninguna jornada pasa de 12 h, así que no hay doble tiempo por el cruce. El segmento entra en la semana de su `startMs`. El desfase de presentación que ya corrigió la auditoría anterior no se volvió a abrir.
- **Almuerzo con inicio y fin, y pausas.** Los minutos del intervalo de comida van al segmento que los contiene. `RESUME` de la comida no suma otra vez `totalPausedMs`. Una jornada de un solo segmento cuadra con `computeSessionMinutes`. El tope «60 declarados en 36 min de jornada» deja 36 de almuerzo y 0 de trabajo.
- **Tránsito.** Se paga a su multiplicador (por defecto 1×). `countsTowardOvertime` consume cupo diario y semanal de regular, y la línea de tránsito no lleva el recargo. Está documentado así.
- **Redondeo.** Minuto más cercano acumulado (`segmentation.cumulativeMinutes`). Cada línea en centavos: `round(minutos × round(tarifa × 100) / 60)`. El bruto es la suma de las líneas. Las centésimas del documento salen de `allocateDisplayHundredths`. La tarifa no se aplica dos veces.
- **Manifiesto v4 con la firma puesta.** `packHash` es el SHA-256 de `packHashBody`. La firma, `files`, `documentVersion`, `documentTheme` y `documentLocale` quedan fuera. v3+ mete `sealWarnings` en `packHash` y no en `contentHash`. `ledgerHeadHash` y `ledgerChainValid` quedan fuera de `contentHash`. Con la firma intacta, `verify` rechaza un cuerpo tocado.
- **Cadena.** El hash de cada asiento enlaza con el anterior. El JSON canónico es estable. Los triggers impiden `UPDATE` y `DELETE` en caliente. El modelo de segmentos más reconocimiento de ruptura cuadra cuando la verificación es completa.
- **Tiempo futuro en los caminos manuales.** Cierre manual, parche, fin de huérfana, inicio de comida y inicio de traslado pasan por `future()`. El sello rechaza un fin posterior al techo. `parseTimestamp` no usa `Date.parse` de locale. La hora de red, por sí sola, no baja una jornada de `VALIDADA` (arreglo de campo `a30f7ce`, cubierto por `clockSample`).
- **SQLite y cifrado.** Las migraciones suman columnas. La migración de coordenadas revierte si la verificación no cuadra. Sin clave, el sobre se escribe `plain:v1:` con `degraded: true` y un bloqueo de certificación (`FieldCryptoService.ts:15`, prefijo en `:66`): es explícito, no un cifrado que falla en silencio. El PIN de administración va con scrypt. La clave de firma del pack vive en el slot `dt.packsig.ed25519.v1`. El logger redacta la clave maestra.
- **i18n.** `en` está tipado como el diccionario español, así que una clave ausente rompe `tsc`. `t()` cae al español y luego a la clave. Las cadenas de soporte viven en `supportEs` / `supportEn` y cuelgan de `es.support`. El test de soporte de la suite de 788 las recorre. Un barrido mecánico que las marca como ausentes es un falso positivo.
- **`findForPeriod`.** `listPacks` ordena por `created_at_ms DESC`. El pack que se reutiliza es el más reciente del periodo.

## Re-prueba en el teléfono

Pasos para quien tenga el aparato. A5 no es criterio de paso: sigue pendiente y no se midió en un iPhone.

1. **A1.** Cierra una semana y sella el expediente. Si más adelante el registro de integridad queda con un incidente abierto (el barrido o un arranque lo anotan), vuelve a Reportes e intenta sellar el mismo periodo. La app tiene que negarse con el aviso de registro dañado y no abrir el PDF anterior como si el sello hubiera salido bien. El aviso de expediente desactualizado tiene que poder mostrarse: con el incidente abierto, la frescura ya no dice que el contenido coincide.

2. **A2.** Sella un periodo con el llavero disponible y comprueba que ese expediente sigue verificando (esquema Ed25519, sin fallos). Copia el `manifest_*.json` fuera del teléfono, cambia horas o el bruto, recalcula los hashes y borra `signature`. La verificación de ese archivo tiene que fallar por firma ausente. Vuelve a firmarlo con otra clave: tiene que fallar por clave distinta. Un expediente sellado cuando el llavero no estaba (aviso `PACK_UNSIGNED`) sigue verificando como manifiesto sin firma. Un expediente viejo, de manifiesto v1–v3, también, si sus hashes no se tocaron.

3. **A3.** Con la app cerrada, edita el archivo SQLite y altera el `payload_json` de un asiento antiguo sin cambiar la columna `hash` (hace falta soltar el trigger antes). Al abrir la app, el arranque —que usa la verificación incremental— tiene que ver la ruptura en ese asiento, sin esperar al barrido del día siguiente.

4. **A4.** Adelanta el reloj del teléfono unos 30 minutos, deja que la jornada registre una salida y vuelve a poner la hora bien. Cuando venza la decisión de salida y el cierre automático corra, el fin guardado tiene que quedar en el presente (techo de unos 2 minutos), no en la hora adelantada. La nómina de esa jornada no debe incluir esos minutos de más. Un cierre manual del mismo hecho sigue rechazándose mientras el fin propuesto sea futuro.

5. **A5, pendiente.** No lo des por bueno. Si más adelante hay un iPhone a mano: jornada abierta, pantalla apagada más de 3 minutos, volver a primer plano. Anota si la jornada pasa a revisión por deriva de reloj (`CLOCK_DRIFT`) solo por el sueño. Este PR no cambia ese orden (medir y después reanclar).

6. **A6.** Jornada activa dentro del sitio, con más de un minuto y medio de permanencia. Aléjate hasta quedar en la banda dudosa: fuera del radio del sitio y todavía dentro del radio más 50 m de histéresis (con el radio de prueba de 100 m, unos 122 m y un fix de unos 10 m). La jornada no puede quedarse en activa para siempre. Como mucho, tras dos plazos de debounce (por defecto 2 min, así que unos 4 min) tiene que pasar a salida y dejar de sumar tiempo abierto a partir de la primera salida. Si el sistema manda otro evento de salida mientras la decisión sigue pendiente, ese evento tiene que contar, no perderse.

7. **A7.** Con un incidente de ledger reconocido dentro de la semana (el administrador lo reconoce con el PIN), abre Reportes. El sello de «certificado» no debe aparecer. Sellar ese periodo tiene que coincidir con lo que dice la pantalla: rechazo, o sello sin certificar si se fuerza. En un rango de varias semanas, si una semana no está certificada, el conjunto tampoco. Una sesión que cruza la medianoche cuenta una vez en el desglose VMAC.

8. **A8.** En una jornada con pausa (no comida), abre el detalle de la sesión y el reporte del periodo. En español la línea dice «Pausa». Cambia el idioma a inglés: «Break». La comida sigue diciendo «Almuerzo» / «Lunch». El PDF ya decía «Pausa» y tiene que seguir igual.

9. **A9.** Jornada de 60 minutos con 10 minutos de pausa. Declara un almuerzo fijo de 55 minutos, sin hora de inicio, e intenta cerrar. Tiene que rechazarse: el almuerzo más las pausas no caben. Con 50 minutos tiene que guardarse. El mensaje, en los dos idiomas, habla de almuerzo y pausas dentro de la jornada.

10. **A10.** Turno que cruza la medianoche, almuerzo fijo de 60 minutos sin reloj de comida, y una pausa que ocupa el primer tramo corto (el repro de laboratorio: inicio 21 sep 2026 23:50 hora del Pacífico, 10 min de pausa y 480 min más). El trabajo pagable es 420 minutos y el almuerzo 60. El cierre manual del usuario, cuando el turno cruza el día, sigue pidiendo hora de inicio del almuerzo; este caso se ve en datos ya guardados o en un cierre que no es el del operario. Una jornada de un solo segmento no cambia: el almuerzo que cabe se queda en esa única línea.

## Qué entra en este PR

Este documento, la corrección de A1–A4 y A6–A10, y la suite permanente `src/services/domain/__tests__/auditFixes.2026-10-20.test.ts`. A5 queda documentado como pendiente. Los hashes de los packs ya sellados no cambian. La clave pinada de firma sigue verificando los packs que ella misma firmó.
