# PROJECT_STATE.md

> **Propósito:** Fotografía objetiva y actualizada del estado real del proyecto.

## 1. Resumen General
- **Proyecto:** Dual Tracker V1.0.0 (repo `BDevDPaz/dual-tracker`, paquete `com.bdevdpaz.dualtracker`).
- **Versión / Hito actual:** 1.0.0-rc.1. La versión visible es `1.0.0` (`app.json:6`, `package.json:5`, `src/constants/app.ts:2`). El perfil `preview` fija el canal `RC1` (`eas.json`, `EXPO_PUBLIC_RELEASE_CHANNEL`). Etiquetas git: `v0.1.0` (`a38db18`, 2026-10-07) y `v1.0.0-rc.1` (`ce4fc8a`, merge del #13, creada el 2026-10-19). No hay releases de GitHub.
- **Última actualización:** 2026-11-26. Medido sobre `main` en `e15e530` (merge del #60); actualizado el mismo día con #58 (docs), #59 (tests del fallo «sin destino») y #60 (aviso sin bloqueo). La suite completa no se volvió a correr sobre este `main`: lo verificado en Termux el 2026-11-26 fue `test:domain` 61/61 suites, 500/500 tests, `npm test -- DailySetupModal` 5/5 y `tsc` 0 errores.
- **Estado general:** En desarrollo. La candidata RC1 está abierta y su acta de teléfono (`docs/PRUEBAS_RC1.md` §Acta) está vacía. #53, PR2 (Ajustes, #55), #56 (sin overlay y banderas legales apagadas) y PR3 (Reportes de nómina y Auditoría de jornadas, #57) están mergeados, y también #59 y #60. Falta probarlos en un teléfono.
- **Referencias:** Reglas en `AGENT.md` | Historial en `CHANGELOG.md`

### Cómo se rellenó este archivo (2026-11-25)
- Nada se marca «funciona» sin evidencia del repo. Para cada módulo se comprobó:
  1. El archivo existe en `main`.
  2. Está cableado a una pantalla o a la navegación (archivo:línea).
  3. Tiene tests y pasan en la corrida completa del día.
  4. La configuración que le aplica (`app.json`, `app.config.ts`, `eas.json`, `package.json`).
- Categorías:
  - **Funciona (verificado por tests/código):** hay código cableado y tests que pasan hoy. No implica prueba en un teléfono.
  - **Existe pero incompleto:** hay código, pero falta una parte pedida o una entrada en la UI.
  - **Con errores:** el código o la documentación contradicen lo esperado, con evidencia.
  - **No verificado (requiere dispositivo):** depende de Android o iOS reales (geocerca, servicio en primer plano, notificaciones, PDF impreso, contraste, TalkBack) y no hay acta firmada en el repo.
- Comandos ejecutados el 2026-11-25 sobre `1329849` (Node 24.22.1, `npm ci`):
  - `npx tsc --noEmit`: 0 errores.
  - `npx eslint .`: 0 errores y 4 avisos (`scripts/check-dates.ts:22`, `test/mocks/expo-sqlite.ts:8`, `test/runtimeHarness.ts:22-23`).
  - `npx jest --runInBand --watchman=false`: 146/146 suites, 1081/1081 tests, 2/2 snapshots.
  - `npx dpdm -T` sobre `app/` y `src/`: 0 dependencias circulares.
- Repetido el 2026-11-25 en la rama del PR3 rebasada sobre el #56 (`a765959`): `tsc` 0 errores, `eslint` 0 errores y 4 avisos, `jest` 155/155 suites, 1150/1150 tests, 2/2 snapshots. `dpdm` no se repitió.

## 2. Estado de Diseño (UI / UX)

Fuente visual en el código: `src/constants/theme.ts` (paletas oscura y clara, Inter 400/500/600 en `FONT_FAMILY`, `theme.ts:383-385`). El repo no tiene wireframes ni mockups versionados. Los wireframes de flujo F1–F9 (2026-11-25) se generaron desde el código y no están en el repo. La columna «Estados» marca solo lo que se vio en el archivo de la pantalla; «sin auditar» quiere decir que no se revisó línea por línea, no que falte.

| Pantalla / Flujo | Wireframe | Mockup | UI en Código | Estados (Normal / Carga / Vacío / Error) | Notas |
| :--- | :---: | :---: | :---: | :---: | :--- |
| Arranque y gate (`app/index.tsx`, `app/(boot)/hydrating.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / n.a. / [x] | Gate `initialHref` (`app/index.tsx:14`, `src/core/initialRoute.ts:12`). Error de arranque con «Reintentar». |
| Alta, 5 pasos (`app/(onboarding)/*`) | [x] fuera del repo | [ ] | [x] | sin auditar | `STEPS` = welcome, disclosure, permissions, profile, ready (`app/(onboarding)/_layout.tsx:14`). Estado de permisos desde PermissionsHealthService. |
| Hoy (`app/(tabs)/index.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / botones `busy` / [x] / [x] | Vacío `EmptyState` (`index.tsx:308`). Banners de conflicto y de degradado (`:237`, `:267`). Banner de aviso si el destino no tiene coordenadas (`index.tsx:327-328`, #60). En jornada huérfana el pie lleva a la revisión, no al cierre (`index.tsx:86`, `:561-571`, #64). Pantallas renderizadas en tests: `cancelDay.confirm.test.tsx` y `today.hoyFixes.test.tsx` (#64). |
| Historial (`app/(tabs)/history.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / [ ] | Carga antes de hidratar (`history.tsx:119`, #64). Vacío (`:216`). Enlace al reporte de la semana elegida (`:190`, #64). No se encontró estado de error en el archivo. Test: `app/(tabs)/__tests__/history.screen.test.tsx`. |
| Reportes (`app/(tabs)/reports.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / parcial | Carga y vacío (`reports.tsx:143`, `:234`). Error de rango (`:230`). No se encontró un error de consulta (`preview.error` no se usa). Semana no certificable sin CONFLICT: motivo y «Exportar no certificado» (`reports.tsx:361`). Pack sin PDF: «Volver a emitir» en la lista (`:416-431`). |
| Ajustes (`app/(tabs)/settings.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / botones `busy` / [x] / [x] | Errores de campo (`settings.tsx:312-347`). Vacíos de cola y retención (`:380`, `:392`). Copia de seguridad cifrada `.dtbackup`, crear y restaurar (#55, `src/components/blocks/BackupSection.tsx`). |
| Detalle de sesión y rastro (`app/session/[id].tsx`, `trace.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / sin auditar | Carga (`[id].tsx:70`, `:185`). Sin datos (`:193`). «Ver auditoría» lleva a `/session/[id]/audit` (`[id].tsx:211-212`, #57). Test: `app/session/__tests__/sessionDetail.hhFixes.test.tsx` (#64). |
| Periodo `/report/[periodId]` | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / [x] | Carga, error y sin datos (`[periodId].tsx:43-53`), vacío (`:74`). Se llega desde «Vista previa» en Reportes (`reports.tsx:136`, `:304`, `:333`) y desde el expediente (`[packId].tsx:128`). Incluye la sección Auditoría (`[periodId].tsx:155`). #57. |
| Expediente `/report/pack/[packId]` | [x] fuera del repo | [ ] | [x] | [x] / [x] / sin auditar / [x] | Carga (`[packId].tsx:37-40`). No existe: `NotFoundState`. Sin PDF en este teléfono: aviso `report.pdfMissing`, compartir deshabilitado y «Volver a emitir» (`[packId].tsx:62`, `:147-159`). |
| Destinos (`app/sites/*`) | [x] fuera del repo | [ ] | [x] | sin auditar | Vacío en la lista (`app/sites/index.tsx:45`). |
| Salud (`app/system/health.tsx`), Conflicto (`app/system/conflict.tsx`) | [x] fuera del repo | [ ] | [x] | sin auditar | Salud muestra el estado de la copia de seguridad y enlaza a Ajustes (`health.tsx:314`). |
| Soporte y práctica (`app/support/*`), Legal (`app/legal/*`) | [x] fuera del repo | [ ] | [x] | sin auditar | — |

- **Sistema de diseño / Tokens:** definido en código (`src/constants/theme.ts`, #44 y #50). No hay mockup versionado con el que compararlo.
- **Ajustes visuales abiertos:**
  - Contraste, TalkBack y aspecto en un teléfono: no verificados. Los PR #38 y #50 lo dicen.

## 3. Estado de Funciones y Lógica

### Completado y verificado
Verificado por tests y código el 2026-11-25. **Ningún punto de esta lista está probado en un teléfono.**
- **Arranque y gate:** hidratación, alta, aviso, conflicto y pestañas, en ese orden (`src/core/initialRoute.ts:12-24`). Test de `initialHref`: `src/services/domain/__tests__/pr2UserFlow12_3.test.ts`.
- **Alta y permisos (PHS):** 5 pasos. La ubicación precisa es obligatoria, y el segundo plano, la batería y las notificaciones se pueden omitir con aviso. Tests: `src/onboarding/__tests__/flow.test.ts`, `src/components/blocks/__tests__/PermissionsStep.test.tsx`, `src/services/runtime/__tests__/PermissionsHealthService.test.ts`, `src/utils/__tests__/permissionChain.test.ts`.
- **Jornada, máquina de estados e intenciones:** iniciar, llegar, pausa, almuerzo, salida, traslado y cierre, por `intentRouter` (`src/services/application/intentRouter.ts`) y `sessionMachine` (`src/services/domain/sessionMachine.ts`). Tests:
  - `app/(tabs)/__tests__/` (checkInOut, closeDay, lunch, cancelDay).
  - `src/services/domain/__tests__/sessionMachine.test.ts`, `pr2UserFlow12_3.test.ts`, `inicioJornada.blueprint.test.ts`.
  - `src/services/application/useCases/__tests__/startDay.test.ts`, `confirmExit.test.ts`.
- **Nómina de California:** OT diaria y semanal, doble tiempo y séptimo día (**apagados por defecto**, `src/utils/companyPolicy.ts:8-12`; se activan en Ajustes → Calendario laboral y un valor guardado se respeta), primas de comida y descanso, un almuerzo por día de nómina y tarifa congelada por jornada (`sessions.hourly_rate_snapshot`). Tests: `PayrollEngineService.test.ts`, `caRules.test.ts`, `mealPremium.test.ts`, `mealRules.test.ts`, `restRules.test.ts`, `dayLunch.test.ts`, `hourlyRateSnapshot.test.ts`, `policyV2.test.ts`.
- **Libro append-only y sello:**
  - Cadena SHA-256, manifiesto v6 (`src/core/contracts/evidence.ts:145`; v6 desde #66, fusionado en `main` (`0fb1623`, 2026-11-26)), firma Ed25519, `SESSION_SEALED` y `sessionReplay`.
  - Esquema SQLite v9 (`src/services/persistence/schema.ts:24`).
  - Tests: `IntegrityLedgerService.test.ts`, `HashChain.test.ts`, `EvidencePackService.test.ts`, `packSignature.test.ts`, `app/(tabs)/__tests__/sealVerify.flow.test.ts`, `ledgerIntegrity.test.ts`.
- **Reportes (lo que hay hoy):**
  - Rango semana actual, semana anterior, quincena, mes y fechas (`src/utils/reportRange.ts:9`).
  - PDF del rango sin sellar, `EXPORT_RANGE_PDF` (`reports.tsx:280`).
  - Sellar la semana, `SEAL_PACK`.
  - «Exportar expediente», `EXPORT_PACK` (`reports.tsx:130`): comparte el **comprobante del empleado** (`intentRouter.ts:387-395`), como confirmó el dueño.
  - «Compartir expediente empleador», `SHARE_EMPLOYER` (`reports.tsx:371`, `app/report/pack/[packId].tsx:138`): usa el correo si hay cliente y si no, la hoja de compartir.
  - Tests: `ReportService.test.ts`, `previewPayrollRange.test.ts`, `generateWeeklyPayroll.test.ts`, `reportPremium.test.ts`, `reportRange.test.ts`.
- **Ajustes:** perfil, monitoreo, destinos, zona admin con PIN, calendario, retención, soporte y legal (`app/(tabs)/settings.tsx`). Validación en línea de la zona admin y aviso si la zona se cierra con cambios sin guardar (#63). Tests: `settings.admin.flow.test.tsx`, `settingsPolicy.test.ts`, `app/(tabs)/__tests__/settings.flow.test.ts`, `pin.flow.test.ts`, `src/services/runtime/__tests__/pinHash.test.ts`, `pinProvision.test.ts`, `SettingsService.test.ts`.
- **Destinos:** alta, ficha, radio válido y nombre del lugar desde el GPS (`reverseGeocodePoint`, `src/services/runtime/reverseGeocode.ts`). Tests: `SiteRegistryService.test.ts`, `reverseGeocode.test.ts`, `SiteRadiusField.test.tsx`, `siteRadius.test.ts`. Si la geocodificación falla, el sitio se guarda sin coordenadas y el modal y Hoy avisan (`sites.coordsMissing`, #59, #60; `DailySetupModal.tsx:225`, `app/(tabs)/index.tsx:327-328`).
- **Cifrado de campos:** AES-GCM, migraciones y pérdida de clave. Tests: `FieldCryptoService.test.ts`, `cryptoMigrations.test.ts`, `keyLoss.test.ts`.
- **Idioma es/en:** paridad de claves y cambio en el acto. Tests: `src/i18n/__tests__/i18n.test.ts`, `languageSwitch.test.tsx`, `setLanguage.test.ts`, `hardcodedCopy.test.ts`.
- **Soporte y modo práctica aislado:** tests `src/support/__tests__/support.test.ts`, `src/services/application/__tests__/practiceIsolation.test.ts`.
- **Claves `common.showDetails` y `common.hideDetails`** (#53, `1138cfd`). Test: `OperationalHeroCard.test.tsx`.
- **Copia de seguridad en Ajustes** (PR2, #55, `a9d52a5`): `.dtbackup` cifrado, vista previa sin escribir y reemplazo total con `BACKUP_RESTORED`. Tests: `backupCodec.test.ts`, `appBackup.test.ts`, `settings.backup.flow.test.tsx`, `backupPlacement.test.ts`.
- **Reportes de nómina y Auditoría de jornadas** (PR3, #57). Falta probarlo en un teléfono (§5).
  - Bloque «Reportes de nómina» en Reportes: «Vista previa» → `/report/[periodId]`, «Exportar expediente» y «Enviar por correo» (`reports.tsx:303`).
  - Vista previa del periodo con la sección Auditoría (`app/report/[periodId].tsx:142`, `:155`).
  - Auditoría por jornada (`app/session/[id]/audit.tsx`, `selectSessionAudit` en `src/core/selectors/sessionAudit.ts:224`). Lo que no se guarda sale como «no registrado».
  - Tests: `src/core/selectors/__tests__/sessionAudit.test.ts`, `src/services/application/useCases/__tests__/sessionAudit.test.ts`, `src/components/blocks/__tests__/SessionAuditView.test.tsx`, `app/report/__tests__/payrollReport.flow.test.tsx`, `src/core/__tests__/auditReadOnly.test.ts`.
- **Destino sin coordenadas: aviso sin bloqueo** (#59, #60, `e15e530`). Si la geocodificación falla, el sitio se guarda sin coordenadas y la jornada abre en ESPERANDO, pero ya no en silencio: `routeIntent` expone `geofenceReady` en `START_DAY` y `geocoded` en `UPSERT_SITE` (`src/services/application/intentRouter.ts:287-288`, `:340`; `IntentResult` en `src/core/contracts/intents.ts:294`), el modal muestra `sites.coordsMissing` al confirmar (`src/components/modals/DailySetupModal.tsx:225`) y Hoy muestra un `Banner` de aviso derivado del destino objetivo (`app/(tabs)/index.tsx:327-328`). Tests: `siteGeocodeFailure.test.ts`, `upsertStartDayGeocodeFailure.test.ts`, `DailySetupModal.test.tsx`, `targetCoordsWarning.test.ts`.
- **Calidad estática:** `tsc` sin errores, eslint sin errores, 0 ciclos de importación (`dpdm -T`).

### En progreso
- **#64 Hoy e Historial** (rama `fix/hoy-historial`, sin fusionar). Hoy: el texto de «¿Sigues trabajando?» solo promete doble tiempo con `caDoubleTime` (H-2b); el supervisor de almuerzo cuenta desde `lunch.startAtMs` y el cronómetro del hero descuenta el almuerzo (H-4); en jornada huérfana el pie lleva a la tarjeta de revisión (H-6); la clave KV `AUTO_CLOSE_BANNER` se borra al mostrar el banner (H-5); la hoja de salida y «Cómo funciona» usan el plazo real `exitDecisionWindowMs` (H-17). Historial: «Todo» usa la misma fila de periodo que «Esta semana» (HH-4); aviso antes de sustituir la nota (HH-5); en jornada abierta «Editar» solo corrige la entrada (HH-6); aviso al editar o eliminar en un periodo con expediente sellado (HH-7); estado de carga (HH-2); enlace al reporte de la semana (HH-1); «cancelada» en la fila y el detalle (HH-20). Tests: `today.hoyFixes.test.tsx`, `history.screen.test.tsx`, `sessionDetail.hhFixes.test.tsx`.
- **#63 Ajustes (Solicitud 2):** SS-1, SS-2, SS-3, SS-4, SS-5, SS-8, SS-9 y SS-10, con TP-1…TP-5 y TP-7…TP-9 de los wireframes de Ajustes. Fusionado en `main` (`9aa49bd`, 2026-11-26). Falta probarlo en un teléfono.
- **#62 (Solicitud 1 — Reportes, rama `fix/reportes-rr1-rr2-rr3`): fusionado en `main` (`eb969d7`, 2026-11-26).**
  - **RR-1:** Exportar y Enviar vuelven a sellar si el pack está desactualizado (`currentPackFor`, `src/services/application/intentRouter.ts:172`).
  - **RR-2:** pack sin PDF → `PACK_PDF_MISSING` y «Volver a emitir» en el expediente y en Reportes.
  - **RR-3:** «Exportar no certificado» también sin CONFLICT.
  - **RR-11:** cabecera de `payrollPolicies.ts` corregida.
  - Tests: `reportsPackCurrent.test.ts` y `reportsGates.flow.test.tsx`, en verde en local. Falta probarlo en un teléfono, incluida la restauración real en otro teléfono seguida de «Volver a emitir».

- **#66 Congelado de términos (manifiesto v6, rama `feat/freeze-v6-terms`):** fusionado en `main` (`0fb1623`, 2026-11-26). Tests: `payrollTermsFreeze.test.ts`, `appBackup.test.ts`, `termsNotFrozen.flow.test.tsx`, en verde en local. Falta probarlo en un teléfono, incluido un resello tras cambiar el multiplicador o las banderas.

### Pendiente / Planificado
- **iOS:**
  - El respaldo de geocerca por cambio significativo de ubicación queda para después de la 1.0.
  - El hallazgo 17 de la auditoría 2 y A5 de la auditoría del 2026-10-20 no se han medido en un iPhone.
- **Acta RC1 en un teléfono** (`docs/PRUEBAS_RC1.md` §Acta): todas las filas están vacías, salvo iOS, marcado «No ejecutado».

### Pendiente de validar (cambios en `main` sin evidencia suficiente para `CHANGELOG.md`)
Están en `main` y el código existe, pero no tienen un test propio y su efecto solo se ve en un teléfono. Se mueven a `CHANGELOG.md` cuando haya un test o un acta.
- **Commits directos a `main` del 2026-11-09, sin PR ni test propio:**
  - `21df9c6`: memoización de `SessionListItem` y FlatList en Historial, Rastro y Destinos.
  - `de72115`: teclado en modales (`measureLayout` en Fabric y KAV en Android).
  - `f55de5d`: un `bootFailed` deja el gate en arranque.
  - `85d0326`: al entrar en SALIDA se vuelve a Hoy.
  - `430215a`: `+not-found` vuelve al gate.
  - `002a09b`: la StatusBar sigue el esquema.
  - `3ffb55f`: si `openOsSettings` falla, sale el toast `GENERIC_ERROR`.
  - `9963edd`: ErrorBoundary raíz (`src/components/feedback/ErrorBoundary.tsx`).
- **#40** (colores `useTheme()` en Destinos y textos con `t()`): no tiene tests. Solo está verificado que `tsc` pasa.
- **Parte visual de #33, #44 y #50** (paleta, tipografía, jerarquía del hero, contraste): los tests cubren estructura y textos, no el aspecto. No hay revisión en un teléfono documentada en el repo.
- **Etiqueta `v0.1.0`** (`a38db18`, 2026-10-07): no tiene sección en `CHANGELOG.md`, y el RC1 dice que nunca se publicó una versión anterior. No se puede constatar si fue una entrega publicada.

## 4. Estado de Pruebas y Calidad
- **Build / Compilación:**
  - `tsc --noEmit` pasa sin errores.
  - **No hay evidencia en el repo de un APK de `e15e530`**: hoy no hay build de Android ni de iOS de este commit.
  - Los 14 APK previos que hay fuera del repo (versionCode 1–16) son de commits anteriores.
- **Pruebas automatizadas:** 1081/1081 tests y 146/146 suites en verde, 2/2 snapshots (jest 29.7, 2026-11-25, `1329849`). Eslint: 0 errores y 4 avisos. `dpdm -T`: 0 ciclos. Con el bloqueo del overlay y las banderas apagadas (#56): 1086/1086 tests y 146/146 suites, 2/2 snapshots, `tsc` sin errores y eslint con 0 errores y 4 avisos. Con #56 y #57 (PR3) juntos: 1150/1150 tests y 155/155 suites, 2/2 snapshots, `tsc` sin errores y eslint con 0 errores y 4 avisos. Verificación del 2026-11-26 sobre `e15e530` (Termux, en las ramas de #59 y #60 antes de fusionar): `test:domain` 61/61 suites, 500/500 tests; `npm test -- DailySetupModal` 5/5; `tsc --noEmit` 0 errores. La corrida completa (155/155 suites, 1150/1150 tests) es del 2026-11-25 y no se repitió sobre este `main`, así que su total ya no es el actual.
- **Pruebas manuales:** el repo no tiene actas firmadas.
  - `docs/PRUEBAS_RC1.md` §Acta y las tablas de `docs/PRUEBAS_DISPOSITIVO.md` están vacías.
  - `docs/PRUEBA_CAMPO_1.md`–`8.md` son listas de pasos, sin resultados anotados.
- **Errores abiertos:**
  - `[Severidad: Alta → corregido en código, pendiente de APK]` **`SYSTEM_ALERT_WINDOW` en los APK.**
    - Los 14 APK previos (versionCode 1–16) lo declaraban. El análisis se hizo con `pyaxmlparser`.
    - Origen: la plantilla de prebuild de Expo (`node_modules/expo/template.tgz`, manifiestos `main`, `debug` y `debugOptimized`) y el manifiesto de depuración de React Native (`node_modules/react-native/ReactAndroid/src/debug/AndroidManifest.xml`).
    - Corrección (2026-11-25, decisión del dueño): `android.blockedPermissions` en `app.json`. `npx expo prebuild --no-install --platform android`, en un directorio temporal, escribe `tools:node="remove"` en el manifiesto `main`, y `npx expo config --type introspect` lo confirma. Test: `src/core/__tests__/buildConfig.test.ts`, en la app real y en d11.
    - **No verificado:** un APK de release de EAS sin el permiso. Los manifiestos `debug` y `debugOptimized` de la plantilla lo siguen declarando para los builds de depuración.
    - `READ_EXTERNAL_STORAGE` y `WRITE_EXTERNAL_STORAGE` (plantilla y `expo-file-system`) **se mantienen** por decisión del dueño (ver §6).
  - `[Severidad: Baja]` **Comentario de `app.config.ts`** («El último preview fue versionCode 3»): existe un APK con versionCode 16.
  - `[Severidad: Baja]` **Estados sin cubrir:** Historial no tiene estado de carga ni de error, y Reportes no muestra el error de consulta (§2). Va contra `AGENT.md` §3 («Estados obligatorios»).

## 5. Pendientes Priorizados
1. **Probar en un teléfono la vista previa del periodo y la Auditoría de jornadas (PR3, #57).** Se cierra con el acta de Reportes de nómina y Auditoría rellenada sobre un build identificado.
2. **Verificar en un APK de release que no lleva `SYSTEM_ALERT_WINDOW`.** El bloqueo ya está en `app.json`. Se cierra con la lista de permisos de un APK de `main` (`aapt` o `pyaxmlparser`): sin `SYSTEM_ALERT_WINDOW` y con los permisos de almacenamiento, que siguen por decisión del dueño.
3. **Acta RC1 en un teléfono** (Android, Samsung S22+). Se cierra con la tabla de `docs/PRUEBAS_RC1.md` §Acta rellenada sobre un build identificado.
4. **Probar en un teléfono la geocodificación real y el ENTER/SALIDA del SO con un destino sin coordenadas (#59, #60).** Se cierra con el acta de geocerca rellenada sobre un build identificado, con un destino creado con una dirección que el geocoder del teléfono no resuelve.

## 6. Bloqueos y Confirmaciones Pendientes
- **Bloqueos:**
  - **Ninguna verificación en un APK de `main` actual.** Permisos, geocerca, servicio en primer plano, notificaciones, PDF y contraste dependen de un build y de un teléfono.
  - **Permisos amplios de almacenamiento** (`expo-file-system`) sin bloquear, por decisión del dueño («No bloquees los permisos por ahora»).
- **Decidido por el dueño (2026-11-25):**
  - La bitácora oficial es `CHANGELOG.md`; no se crea `CHANGE-LOGS.md`.
  - `SYSTEM_ALERT_WINDOW` se bloquea (ver §4).
  - Doble tiempo y séptimo día vienen **apagados** por defecto (`DEFAULT_LEGAL_FLAGS`). Hecho en código y con tests (`caRules.test.ts`, R03 y R04, por defecto y activados). Un valor que la empresa ya guardó no se altera.
  - Los permisos de almacenamiento no se bloquean.
- **Por confirmar:**
  - **Empresas que ya guardaron las banderas.** Si el operario cambió antes cualquier chip legal de Ajustes, `applyFlag` (`app/(tabs)/settings.tsx:459` en `a975910`; esta línea citaba `:451`, que es `askFlag`) guardó las tres banderas, incluidos los `true` que entonces venían por defecto. Esos valores se respetan y no se reescriben. Para apagarlas hay que hacerlo en Ajustes → Calendario laboral, o borrar la base de prueba. Los expedientes ya sellados no cambian. Los periodos sin sellar de una empresa sin banderas guardadas se recalculan sin doble tiempo ni séptimo día. Desde el #63 se guarda solo la bandera tocada (SS-3).
  - **Cambio de política de nómina (SS-1, #63).** Comportamiento documentado y que se mantiene: las semanas sin sellar se recalculan con la política vigente y los expedientes sellados conservan la suya (spec v1.3 §5.2 N3 citada en `EvidencePackService.ts:447-448` y `PayrollEngineService.ts:381-395`; `README.md:297`). El #63 solo añade el asiento `PAYROLL_POLICY_CHANGED`. Resello y reemisión: decidido por Byron 2026-11-26 congelar multiplicador y banderas al resellar/reemitir; implementado en #66 (manifiesto v6, `payrollTerms` dentro de `packHash`; `src/services/domain/payrollTerms.ts`, `EvidencePackService.ts:290-292`). Los packs v1–v5 no guardan esos valores: se calculan con los vigentes y muestran «términos no congelados». Abierto, sin fusionar.
  - `AGENT.md` §1–§3 siguen como plantilla, con los campos entre corchetes sin rellenar.
  - Si la etiqueta `v0.1.0` cuenta como versión entregada (ver §3).
