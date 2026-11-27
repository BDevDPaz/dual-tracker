# Changelog

Todos los cambios notables de Dual Tracker V1.0.0 se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Versionado semántico](https://semver.org/lang/es/).

> **Verificación del 2026-11-25.** Revisión actualizada sobre `main` en `fac761c` (25 nov 2026, 18:07 PST, America/Los_Angeles): `tsc` 0 errores; `eslint` 0 errores y 4 avisos; `jest` 155/155 suites, 1150/1150 tests, 2/2 snapshots. Una entrada se considera constatada si cumple las tres condiciones:
> 1. El PR está mergeado y su commit es ancestro de `main`.
> 2. Sus archivos siguen en el repo.
> 3. Sus tests están presentes y pasan en la corrida completa del día (`jest`: 155/155 suites, 1150/1150 tests, 2/2 snapshots; `tsc` 0 errores; `eslint` 0 errores y 4 avisos). En los PRs que solo tocan documentación o refactors, basta con el archivo o con la comprobación estática.
>
> Ninguna entrada está probada en un teléfono por esta revisión: el acta RC1 sigue vacía. Las entradas antiguas no se borran. Cuando el código actual ya no hace lo que una entrada dice, se marca con *Nota 2026-11-25*. Lo que no se pudo constatar está en `PROJECT_STATE.md` §3 («Pendiente de validar»).

## [Sin publicar]

Cambios en `main` después de los PRs #1–#12. La candidata 1.0.0-rc.1, abierta por el #13, sigue descrita en la sección de abajo. Aquí entra lo que esa sección todavía no listaba (#13–#27), y desde el 2026-11-25 también #28–#57, excepto #37, que se cerró sin merge. Desde el 2026-11-26 también #58–#60. Los 8 commits directos a `main` del 2026-11-09 (`21df9c6`…`9963edd`) no entran: no tienen PR ni test propio y siguen en `PROJECT_STATE.md` §3.

### Añadido

- **#13** Candidata 1.0.0 (RC1). La versión visible pasa a 1.0.0 y el perfil `preview` expone el canal RC1 en Ajustes, Soporte y el diagnóstico. El `versionCode` sigue en EAS. El contenido de esa candidata está en [1.0.0-rc.1].
- **#14** Restyle premium: obsidiana, oro y Montserrat 400/500/600 en Hoy, Historial, Reportes, Detalle, Rastro, Ajustes y Salud. No cambia la nómina, el libro ni los hashes. Lista: `docs/UI_PREMIUM.md`. *Nota 2026-11-25: el #44 cambió la tipografía a Inter y la paleta. Montserrat ya no está en el código (`src/constants/theme.ts:383-385`, `app/_layout.tsx:19-21`).*
- **#15** Comprobante premium. `documentVersion`, `documentTheme` y `documentLocale` quedan fuera de `packHash` y de `contentHash`. El QR es el `packHash`, sin URL. Un expediente ya sellado no se reescribe. Lista: `docs/COMPROBANTES_PREMIUM.md`.
- **#22** Manifiesto v5 (`PACK_MANIFEST_VERSION = 5`): identidad del build y zona de cada sesión dentro de `packHash`; cada eslabón exporta `prevHash` y `payloadJson`; anexo de tramos. La plantilla del PDF pasa a documento v3, fuera de los dos hashes. Lista: `docs/PRUEBA_CAMPO_4.md`.
- **#26** Fase 3: estado de monitoreo derivado, latido por componente (`service_health`), aviso persistente con sitio y GPS, catálogo de severidad, anomalías deduplicadas, integridad del dispositivo (`modules/device-integrity`) y puntaje informativo de la ubicación. Lista: `docs/PRUEBA_CAMPO_7.md`.
- **#27** Fase 4: cobertura de monitoreo, auditoría de avisos críticos, reconstrucción de minutos (`sessionReplay`), índice único `idx_ledger_prev_hash`, espera de llegada y `BOOT_RESUME` (`modules/device-uptime`). Lista: `docs/PRUEBA_CAMPO_8.md`.
- **#29** Cada jornada guarda la tarifa por hora vigente (`sessions.hourly_rate_snapshot`, esquema v8; hoy `SCHEMA_VERSION = 9`). Cambiar la tarifa con PIN queda en el libro (`HOURLY_RATE_CHANGED`). Verificación: `hourlyRateSnapshot.test.ts`, `warningLabels.test.ts`.
- **#31** Guía de permisos de Android en el alta, en Salud y en Soporte: batería, «Permitir todo el tiempo» y el paso de Samsung. Verificación: `PermissionCard.test.tsx`, `PermissionGuidancePanel.test.tsx`, `PermissionsStep.test.tsx`, `permissionGuidance.test.ts`. No está probada en un Samsung.
- **#35** Nómina de California: doble tiempo, séptimo día y primas de comida y descanso. `caDoubleTime` y `caSeventhDay` quedan **activas por defecto** (`src/utils/companyPolicy.ts:8-12`), y se elimina `LEGACY_DAILY8`. *Nota 2026-11-25: los valores por defecto vuelven a estar apagados (ver «Cambiado», banderas legales).* Verificación: `caRules.test.ts`, `PayrollEngineService.test.ts`, `mealPremium.test.ts`, `mealRules.test.ts`, `restRules.test.ts`, `policyV2.test.ts`.
- **#36** Máquina de estados USER_FLOW v1.2 §12.3. La época de instalación `pr2-12.3` (`src/services/persistence/schema.ts`) borra una base de prueba anterior. Verificación: `pr2UserFlow12_3.test.ts`, `sessionMachine.test.ts`, `cancelDay.confirm.test.tsx`.
- **#38** Inicio de jornada v1.3 (D-01…D-29): fichaje con una lectura fiable y la hoja «Salida detectada» sin almuerzo (D-19, `src/components/modals/ExitDetectionModal.tsx:10`). Verificación: `inicioJornada.blueprint.test.ts`, `geofence.task.test.ts`, `exitDecisionTimer.task.test.ts`, `geofencePolicy.test.ts`.
- **#39** Avisos de llegada y salida con tres acciones (Terminar jornada, Otro trabajo, Sigo trabajando). La espera de llegada por defecto queda en 0. Verificación: `pr3Notifications.test.ts`, `sessionWatchdog.task.test.ts`, `pin.flow.test.ts`. La notificación real no está probada en un teléfono.
- **#43** PDF del rango que se ve en pantalla, sin sellar (`EXPORT_RANGE_PDF`, marca «SIN SELLO»), y título corto del almuerzo ya descontado. Verificación: `generateWeeklyPayroll.test.ts`, `intentRouter.test.ts`, `reportPremium.test.ts`, `LunchModal.test.tsx`.
- **#45** Nombre del lugar desde el pin GPS (`reverseGeocodePoint`). Si la búsqueda no da resultado, la dirección no cambia. No pide permisos nuevos. Verificación: `reverseGeocode.test.ts`, `SiteRegistryService.test.ts`.
- **#46** Alta en 5 pasos: Bienvenida, Aviso, Permisos (hasta 3 subpasos con el estado de PermissionsHealthService), Perfil con la tarifa bloqueada y Listo (`app/(onboarding)/_layout.tsx:14`). Verificación: `flow.test.ts`, `PermissionsStep.test.tsx`, `SettingsService.test.ts`.

- **#55** Copia de seguridad cifrada `.dtbackup` en Ajustes, con restauración por reemplazo total y el asiento `BACKUP_RESTORED`. Reportes no crea ni lee copias. Verificación: `backupCodec.test.ts`, `appBackup.test.ts` (cifrado, validación, reemplazo y rollback), `settings.backup.flow.test.tsx`, `backupPlacement.test.ts`.
- **#57** (PR3) Bloque «Reportes de nómina» en Reportes (Vista previa, Exportar expediente, Enviar por correo), `/report/[periodId]` reintegrada como vista previa del periodo y Auditoría de jornadas de solo lectura (`selectSessionAudit`, `app/session/[id]/audit.tsx`, sección en la vista previa). Lo que no se guarda sale como «no registrado». Verificación: `sessionAudit.test.ts` (selector y caso de uso), `SessionAuditView.test.tsx`, `payrollReport.flow.test.tsx`, `auditReadOnly.test.ts`.
- **#59** Tests que documentan el fallo «sin destino»: si la geocodificación falla al crear un destino manual, el sitio se guarda sin coordenadas, la jornada abre en ESPERANDO y la geocerca no se arma, sin aviso en el modal ni en Hoy. 7 tests nuevos de dominio y flujo (`siteGeocodeFailure.test.ts`, `upsertStartDayGeocodeFailure.test.ts`) y 3 tests UI del modal (`DailySetupModal.test.tsx`). Verificación (Termux, 2026-11-26, rama `test/sin-destino-geocode-failure`, merge `33408c9`): `npm run test:domain` 60/60 suites, 496/496 tests; `npm test -- DailySetupModal` 5/5; `npm run typecheck` limpio.

### Cambiado

- **#56** **Banderas legales apagadas por defecto** (decisión del dueño, 2026-11-25). `DEFAULT_LEGAL_FLAGS.caDoubleTime` y `caSeventhDay` pasan a `false` (`src/utils/companyPolicy.ts:8-12`).
  - Un valor que la empresa ya guardó se respeta y no se reescribe.
  - Activadas desde Ajustes → Calendario laboral, la nómina sigue aplicando el doble tiempo (> 12 h a 2×) y el séptimo día.
  - Los expedientes ya sellados no cambian.
  - Verificación: `caRules.test.ts` (R03 por defecto y activado, R04 por defecto, y banderas guardadas) y `pr2UserFlow12_3.test.ts` (T34).
- **#57** (PR3) La tarjeta «Copia de expedientes» de Reportes y del expediente pasa a llamarse «Expedientes por entregar», y su consejo remite a Ajustes › Copia de seguridad. El título de `/report/[periodId]` pasa a «Vista previa del reporte».

- **#30** Robustez: `useBusyAction` evita el doble toque, `ConfirmActionModal` pide confirmación antes de archivar un sitio, dividir un conflicto o cambiar un chip legal, y el radio de sitio se valida. Verificación: `useBusyAction.test.tsx`, `ConfirmActionModal.test.tsx`, `SiteRadiusField.test.tsx`, `siteRadius.test.ts`.
- **#32** Accesibilidad y textos: etiquetas de TalkBack, objetivos táctiles de 48 dp, códigos internos traducidos y un solo `NotFoundState` y `LoadingState`. Verificación: `a11yLabels.test.ts`, `NotFoundState.test.tsx`, `payrollDisplay.test.ts`. TalkBack no está probado en un teléfono.
- **#33** Rediseño visual de la capa de presentación de Hoy, Historial y Reportes, sobre los tokens existentes. Verificación: `SessionTimeline.test.tsx`, `GpsExceptionCard.test.tsx`, `EditSessionModal.test.tsx`, `Input.test.tsx`. El aspecto visual no está verificado y sigue en `PROJECT_STATE.md`.
- **#41** El producto se llama Dual Tracker V1.0.0. Verificación: `mappers.test.ts` y búsqueda en el repo.
- **#42** El almuerzo no pagado se descuenta una vez por día de nómina (`lunchOnDay`, `selectDayLunch`), no una vez por jornada. Verificación: `dayLunch.test.ts`, `selectors.test.ts`, `LunchModal.test.tsx`, `PauseKindModal.test.tsx`.
- **#44** Tokens del tema de Dual Tracker V1.0.0: primario `#F6C452`, tipografía Inter (`src/constants/theme.ts:383-385`). Verificación: `Button.test.tsx`, `premium.test.tsx`, `ThemeContext.test.tsx`, `marks.test.tsx`. Contraste y aspecto en un teléfono: no verificados.
- **#50** Correcciones P1–P10 de presentación: `AlertCenter`, Nivel 1 y Nivel 2 del hero, `describeSystemHealth` y `dailyTargetMinutes`. Verificación: `SystemHealthBlock.test.tsx`, `ThemeContext.test.tsx`. Dejó 2 tests en rojo, que se arreglaron en el #52.

### Eliminado

- **#47** El barril `src/services/index.ts` (ya no existe), la dependencia `dayjs` (no está en `package.json`) y 23 símbolos sin uso. Verificación: `tsc` y `eslint` sin errores.
- **#48 y #49** Ciclos de importación. Verificación: `npx dpdm -T` sobre `app/` y `src/` da 0 ciclos (2026-11-25), con `ledgerBase.ts` y `reportTypes.ts` presentes.

### Documentación

- **#28** README y CHANGELOG al día con `3a632ba`.
- **#34** Licencia propietaria (`LICENSE`) y `"license": "UNLICENSED"` en `package.json`.
- **#51** Se quitan los nombres de proyectos anteriores, se corrige el comentario de `LUNCH_START` en `sessionMachine.ts` y se actualiza el README. Los 4 tests de guarda de los PDF se mantienen.
- **#54** `PROJECT_STATE.md` con el estado verificado y `CHANGELOG.md` respaldado por evidencia (squash `3cf14e2`, 2026-11-25).
- **#58** README y CHANGELOG al día con `main` en `fac761c` (`9198eb1`, 2026-11-26).

### Corregido

- **#65** Onboarding (H-13, H-14, H-2, H-12, H-10).
  - H-13: un deep link (`dualtracker://history`, `/session/1`…) ya no entra sin alta ni aviso. La pila raíz pasa a `src/navigation/RootStack.tsx` y protege `(tabs)`, `session`, `sites`, `report` y `system` con `Stack.Protected` y `canEnterApp` (`src/core/initialRoute.ts`), la misma regla del gate; sin alta o sin aviso, expo-router vuelve al gate. `legal` y `support` siguen abiertos (solo lectura).
  - H-14: `COMPLETE_ONBOARDING` rechaza un nombre de menos de 2 caracteres (`NAME_REQUIRED`, es y en) y el aviso vigente sin aceptar (`DISCLOSURE_NOT_ACCEPTED`). Listo, abierto sin parámetros, vuelve a Perfil o al aviso.
  - H-2: en los subpasos de segundo plano y notificaciones, «Ahora no» y «Continuar» hacían lo mismo; queda un solo botón: «Continuar» si ya está activado, «Ahora no» (con la hoja que explica qué se pierde) si no.
  - H-12: tests de las cinco ramas de `initialHref`, incluidas `needsOnboarding → welcome` y `needsDisclaimer → disclosure`.
  - H-10: README ya no dice que el tema claro está oculto.
  - Tests: `src/core/__tests__/initialRoute.test.ts`, `src/navigation/__tests__/deepLinkGate.test.tsx`, `src/navigation/__tests__/deepLinkGate.conflict.test.tsx`.
- **#62** (Solicitud 1 — Reportes; fusionado en `main` en `eb969d7`, 2026-11-26). Hallazgos RR-1, RR-2, RR-3 y RR-11 de los wireframes de Reportes.
  - **RR-1:** «Exportar expediente» (`EXPORT_PACK`) y «Enviar por correo» (`SHARE_EMPLOYER` con `ensureFresh`) ya no comparten un pack desactualizado. Si el último pack del periodo no coincide con el cálculo de ahora (`describeFreshness`), se vuelve a sellar antes de compartir. Si el periodo ya no se puede sellar como certificado, se muestra el motivo y no se comparte el pack viejo (`currentPackFor`, `src/services/application/intentRouter.ts:168`, `:297`, `:313`; `app/(tabs)/reports.tsx:313`, `app/report/[periodId].tsx:146`).
  - **RR-2:** un pack sin PDF en este teléfono (copia restaurada) tiene salida.
    - Compartirlo devuelve `PACK_PDF_MISSING` con un mensaje que remite a «Volver a emitir», en vez de `PACK_NOT_FOUND` (`src/services/evidence/EvidencePackService.ts:716`, `:727`).
    - El expediente y la lista de Reportes ofrecen «Volver a emitir» (`SEAL_PACK` con `reissue`, asiento `PACK_REISSUED`), con el mismo criterio de certificación que el pack original (`app/report/pack/[packId].tsx:62`, `app/(tabs)/reports.tsx:151`).
    - «Exportar expediente» y «Enviar por correo» reemiten solos un pack al día que no tiene PDF.
  - **RR-3:** una semana no certificable sin CONFLICT muestra el motivo (`reports.notCertifiableGate`) y «Exportar no certificado» (`app/(tabs)/reports.tsx:330`, `:361`). Antes solo aparecía con conflicto.
  - **RR-11 (docs):** la cabecera de `src/services/domain/payrollPolicies.ts:5-9` decía que el doble tiempo y el séptimo día se aplican «por defecto sí»; ahora dice que vienen apagados por defecto, como `src/utils/companyPolicy.ts:8-12`.
  - Verificación: `src/services/application/__tests__/reportsPackCurrent.test.ts` (RT-1 y RT-2, 6 tests) y `app/report/__tests__/reportsGates.flow.test.tsx` (RT-1, RT-2 y RT-3 en pantalla, 5 tests). No probado en un teléfono.
- **#60** Aviso sin bloqueo cuando el destino queda sin coordenadas (corrige el silencio documentado en el #59, no el guardado sin coordenadas: la jornada sigue pudiendo abrirse y la llegada se confirma a mano). `routeIntent` expone `geofenceReady` en `START_DAY` (`src/services/application/intentRouter.ts:193-194`) y `geocoded` en `UPSERT_SITE` (`:240`); el modal muestra `sites.coordsMissing` al confirmar (`src/components/modals/DailySetupModal.tsx:225`) y Hoy muestra un `Banner` de aviso derivado del destino objetivo (`app/(tabs)/index.tsx:308-309`). Verificación (Termux, 2026-11-26, rama `fix/sin-destino-aviso` en `14059ba`, merge `e15e530`): `npm run test:domain` 61/61 suites, 500/500 tests; `npm test -- DailySetupModal` 5/5; `npm run typecheck` limpio. La geocodificación real en Android y el ENTER/SALIDA del SO no están probados en un teléfono.
- **#16** La hora de red ruidosa no quita VALIDADA: hacen falta muestras coherentes y, con ubicación buena, la deriva solo avisa. También el ENTER duplicado, la salida en histéresis y el sello «SELLADO» partido. Lista: `docs/PRUEBA_CAMPO_1.md`.
- **#17** Corte, almuerzo, rastro, reglas y ENTER de borde. El servicio de ubicación sigue en el almuerzo. Una regla sale como aplicada solo si produjo minutos. Lista: `docs/PRUEBA_CAMPO_2.md`.
- **#18** Se rechazan horas de jornada que todavía no han pasado. Ese fin no se guarda, el sello se niega y la nómina de esos minutos no cambia.
- **#19** El almuerzo fijo no pasa de la jornada. Cada fila muestra el redondeo de sus propios minutos. Lista: `docs/PRUEBA_CAMPO_3.md`.
- **#20** Auditoría del 2026-10-20: A1–A4 y A6–A10. El sello no reutiliza un pack con el libro roto, `verify` exige la firma de un v4 que nació firmado, el incremental relee el prefijo, el cierre automático no guarda un fin futuro, y el certificado, la pausa y el almuerzo fijo cuadran con la nómina. A5 (deriva al volver a primer plano, solo iOS) sigue pendiente. Lista: `docs/AUDITORIA_2026-10-20.md`.
- **#21** Auditoría 2: el sello, el candado, el PIN y los estados desconocidos quedan atómicos o fuera de la nómina. La zona horaria es la de la empresa y las horas extra siguen en California. El hallazgo 17 queda en el código y sin validar en un iPhone. Lista: `docs/AUDITORIA_2_2026-10-20.md`.
- **#22** Un traslado cancelado nuevo se congela `paid: true` y se paga a 1×, sin extra, hasta la hora de cancelación. Se muestra como «Tránsito (cancelado)», con esa hora y la nota si la hay. Un cancelado legado (`paid !== true`) sigue contando como trabajo en el sitio. Los minutos por sitio salen de la jornada. Lista: `docs/PRUEBA_CAMPO_4.md`.
- **#23** Auditoría 3: la primera clave del PIN exige la huella fuera de banda o el ancla del build. Un pack cuya firma cuadra, sin esa ancla, no queda como identidad verificada. Si el sello no commitea, se borra el directorio del intento. Lista: `docs/AUDITORIA_3_2026-10-20.md`.
- **#24** Fase 1: una lectura simulada no ficha sola y queda en el libro, en Salud y en el PDF. El salto descuenta la precisión de los dos fixes y usa la hora del fix. Si el servicio en primer plano se cae, el worker intenta arrancarlo y lo anota. Lista: `docs/PRUEBA_CAMPO_5.md`.
- **#25** Fase 2: cada `MANUAL_PATCH` guarda el antes y el después. Al cerrar se añade `SESSION_SEALED` con `sessionHash`. El expurgo y `TRACE_PURGED` van en la misma transacción. Los cambios de permiso, GPS, avisos y batería quedan en el libro. La ubicación aproximada de Android 12+ avisa y no baja el pago. Lista: `docs/PRUEBA_CAMPO_6.md`.
- **#53** Claves i18n `common.showDetails` y `common.hideDetails`; el hero ya no usa texto fijo de respaldo. Verificación: `OperationalHeroCard.test.tsx`.
- **#52** Los 2 tests que rompió el #50: el `inset` de `DailySummaryBlock` vuelve al bloque y el test del hero expande el Nivel 2. Verificación: `layoutInset.test.tsx`, `OperationalHeroCard.test.tsx` y la suite completa en verde.

### Seguridad

- **#56** **Sin overlay.** `android.blockedPermissions` bloquea `android.permission.SYSTEM_ALERT_WINDOW` (`app.json`), que traían la plantilla de prebuild de Expo y el manifiesto de depuración de React Native.
  - El prebuild escribe `tools:node="remove"` en el manifiesto `main`.
  - Los permisos de almacenamiento no se bloquean, por decisión del dueño.
  - Verificación: `buildConfig.test.ts`, `expo prebuild` en un directorio temporal y `expo config --type introspect`.
  - Un APK de release sin el permiso no está verificado todavía (`PROJECT_STATE.md` §4).
- **#20** Un manifiesto v4 que nació firmado y llega sin firma falla con `SIGNATURE_MISSING`. Otra clave falla con `SIGNATURE_KEY`. `PACK_UNSIGNED` sigue siendo el sello sin llavero. La clave que se compara es la del llavero de firma del pack, no la del código de aprovisionamiento del PIN.
- **#21** Si el asiento del PIN no se escribe, SecureStore vuelve al estado anterior y el código se puede repetir. `--pin` en la CLI avisa: el secreto puede ir en archivo, `DT_PIN`, prompt o stdin.
- **#23** La primera fijación de la clave del empleador ya no es de confianza al primer uso. Hace falta la huella tecleada o `src/config/employerKeyAnchor.ts`. Sin ancla, `verify` devuelve `identity: unverified`.
- **#24** `LocationObject.mocked` no abre la llegada automática. El hecho queda como `MOCK_LOCATION`.
- **#27** `idx_ledger_prev_hash` es único. Si ya hay `prev_hash` duplicados, el índice no se crea, el fallo queda en el log y los asientos no se reescriben.

### Limitaciones conocidas

- **Android 12+.** El sistema puede negar el servicio en primer plano si la app está en segundo plano y no está exenta de batería. Ese fallo queda como `SERVICE_RECOVERY_FAILED`. Android 14 exige el tipo `location`.
- **Samsung.** El sueño profundo y un Force Stop no se recuperan hasta abrir Dual Tracker. El worker no baja de 15 minutos.
- **Root.** La detección mira rutas (`su`, Magisk, busybox). Un Magisk oculto puede no salir. Sin el módulo nativo no se afirma que el teléfono esté limpio.
- **Reconstrucción.** Si la política de tránsito cambia después de congelar un tramo, `sessionReplay` puede marcar `SESSION_REPLAY` sin que la fila se haya tocado. No reescribe la nómina.

### Pendiente

- Respaldo de geocerca por cambio significativo de ubicación en iOS (post-1.0). El hallazgo 17 de la auditoría 2 (actualizaciones diferidas en iOS) está en el código y no se ha medido en un iPhone. A5 de la auditoría del 2026-10-20 sigue pendiente.

## [1.0.0-rc.1] - 2026-10-19

Primera candidata a publicación. Parte de `main` en `b2bddad` (PRs #1–#12 ya fusionados). Nunca se publicó una versión anterior: no hay usuarios a los que migrar.

La versión visible es **1.0.0** (`app.json`, `package.json`, `APP_VERSION`). El perfil `preview` de EAS expone el canal **RC1** (`extra.releaseChannel`). En Ajustes y en Soporte se lee `Versión 1.0.0 (RC1) · build N` (inglés: `Version 1.0.0 (RC1) · build N`). El `versionCode` de Android sigue en el servidor de EAS (`appVersionSource: remote`, `autoIncrement` en `preview`). El último preview fue el **3**; el siguiente tiene que ser mayor. No se etiqueta esta candidata. *Nota 2026-11-25: existe la etiqueta anotada `v1.0.0-rc.1` sobre `ce4fc8a`, el merge del #13, creada el 2026-10-19. Hay APK de builds posteriores con versionCode hasta 16. La etiqueta `v0.1.0` (`a38db18`, 2026-10-07) no tiene sección en este archivo (ver `PROJECT_STATE.md` §3).*

### Añadido

- **#1** Rehidratación del reflejo al volver a primer plano y al ganar el foco, y pull-to-refresh en las pantallas de datos. Una escritura de la geocerca o del vigilante se ve sin reiniciar la app.
- **#3** Varios destinos en una sola jornada y traslado pagado entre ellos (de fábrica a ×1, cuenta para el extra). Cadena «Obra A → Obra B» en Historial, detalle y comprobante. Lista de teléfono: `docs/PRUEBAS_MULTI_DESTINO.md` (M1–M8).
- **#4** Idioma de la interfaz (Español / English) al pulsar el chip, sin esperar a Guardar. El primer arranque sigue el perfil o, si no hay, el idioma del teléfono.
- **#5** Diagnóstico de geocerca en Salud (aceptado o rechazado, y el motivo, sin coordenadas). Lista: `docs/PRUEBAS_GEOCERCA.md` (G1–G7).
- **#7** Soporte dentro de Ajustes: guías, preguntas, problemas, consejos descartables y modo práctica que no toca el expediente. Diagnóstico para compartir. Lista: `docs/SOPORTE.md` (S1–S16).
- **#8** El mismo selector de idioma en Ajustes, Soporte y el alta, aplicado en toda la app en el acto (pestañas, modales, avisos, notificación). Lista: `docs/IDIOMA.md` (I1–I19).
- **#9** Sistema visual (ritmo, áreas seguras, fuente del sistema, teclado y cadena de foco). Lista: `docs/UI_SISTEMA_VISUAL.md` (V1–V20). *Nota 2026-11-25: la fuente ya no es la del sistema: la cambió el #14 y hoy es Inter (#44).*
- **#10** Marca: icono Pin-Reloj de la app y símbolo de llegada confirmada en la notificación y en la interfaz.
- **#11** Confiabilidad, tanda 1: jornada huérfana a Revisar sin inventar horas, sensores que bloquean VALIDADA, hora de red, firma Ed25519 del expediente y retención que no borra sin expediente. Lista: `docs/CONFIABILIDAD_TANDA1.md` (R1–R12).
- **#12** Tanda 2: PIN de administración del empleador (`DTPIN1`, un solo uso), portal HTTPS del expediente firmado, reportes por semana, quincena, mes o fechas, y plano local del rastro (sin teselas ni envío de coordenadas). Lista: `docs/TANDA2.md` (T1–T18).

### Corregido

- **#2** Editar sesión ya no convierte dos `HH:mm` iguales, sin tocar los relojes, en un turno de 24 h. Si el minuto no cambió se conservan los milisegundos. Guardar no se habilita solo por la nota.
- **#3** Al llegar al segundo sitio se seguían viendo los destinos de la jornada. Un ENTER no se perdía por una salida pendiente del sitio anterior. El almuerzo puede arrancar desde la salida. El pago del tramo queda congelado al cerrarlo. *Nota 2026-11-25: el almuerzo desde la salida ya no existe. El #38 (D-19) lo quitó de la hoja «Salida detectada» (`src/components/modals/ExitDetectionModal.tsx:10`).*
- **#5** El fichaje automático en Android ya no descarta la llegada por ir en vehículo ni cierra la jornada en 0.00 h por un EXIT inmediato. Si el aviso del sistema no llega, la muestra del servicio en primer plano ficha. Otro destino activo entra en la misma jornada.
- **#6** La porción de medianoche se lee en el comprobante con su tramo y su fecha. Las jornadas de 0 min salen del comprobante del empleado y siguen en el expediente. El total cuadra en centavos. La bandera de una nota ya no baja de línea.
- **#8** El idioma ya no se queda a medias entre el borrador de Ajustes, el alta y Soporte, y el primer fotograma no parpadea del idioma del teléfono al del perfil.

### Seguridad

- **#12** El hash del PIN vigente es scrypt (N=16384, r=8, p=1, sal aleatoria). Uno legado SHA-256 sigue verificando y se reescribe al acertar. La comparación no ataja por longitud.
- **#12** La primera clave Ed25519 del empleador queda fijada en el llavero (`EMPLOYER_KEY_PINNED`). Otra clave se rechaza hasta desbloquear la zona admin (`EMPLOYER_KEY_REPINNED`). El archivo de clave no se versiona y el generador no imprime el secreto.
- **#12** El portal solo hace POST si hay una URL https. La clave de idempotencia es el `packHash`. No sube el PDF. Apagado y sin URL por defecto.
- **#11** La firma del manifiesto no entra en `packHash`. Sin llavero el sello sigue como `unsigned-v1`, con aviso, y no reescribe un PDF ya compartido.
- El diagnóstico de soporte sigue en lista blanca: sin coordenadas, sin nombre, tarifa, correo ni sobres `enc:v1`.

### Limitaciones conocidas

- **Android Doze y Samsung.** Con la app en suspensión profunda, o con la batería restringida, la geocerca puede tardar o no fichar con la pantalla apagada. «Solo mientras se usa» no ficha en segundo plano. Con el servicio en primer plano visible y la batería sin restricciones, las muestras cubren el hueco del aviso del sistema, pero el aviso puede llegar minutos tarde. Si la precisión es peor que el radio del sitio, no hay fichaje automático.
- **El viaje de casa al primer sitio no se paga.** El traslado pagado es el tramo entre dos destinos de la misma jornada. Soporte lo dice en la pregunta correspondiente.
- **Doble tiempo (por encima de 12 h) y séptimo día** están en la política v2 y siguen apagados (`caDoubleTime`, `caSeventhDay`) hasta que asesoría legal lo confirme. No se encienden en esta candidata. *Nota 2026-11-25: ya no es así en el código. Desde el #35 las dos están activas por defecto (`src/utils/companyPolicy.ts:8-12`; test R03 en `caRules.test.ts:31`). README y `docs/` aún dicen «apagados». Queda por confirmar en `PROJECT_STATE.md` §6.* *Nota posterior (2026-11-25): por decisión del dueño, vuelven a estar apagados por defecto (ver «Cambiado» en [Sin publicar]).*
- **iOS no está probado.** No hay acta de iPhone para esta candidata. El respaldo por cambio significativo de ubicación queda para después de la 1.0.0.
- **Migración de bases de datos anteriores a Dual Tracker V1.0.0.** No aplica: esas versiones anteriores nunca se publicaron. El producto es Dual Tracker V1.0.0.
