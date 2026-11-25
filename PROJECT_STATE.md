# PROJECT_STATE.md

> **Propósito:** Fotografía objetiva y actualizada del estado real del proyecto.

## 1. Resumen General
- **Proyecto:** Dual Tracker V1.0.0 (repo `BDevDPaz/dual-tracker`, paquete `com.bdevdpaz.dualtracker`).
- **Versión / Hito actual:** 1.0.0-rc.1. La versión visible es `1.0.0` (`app.json:6`, `package.json:5`, `src/constants/app.ts:2`). El perfil `preview` fija el canal `RC1` (`eas.json`, `EXPO_PUBLIC_RELEASE_CHANNEL`). Etiquetas git: `v0.1.0` (`a38db18`, 2026-10-07) y `v1.0.0-rc.1` (`ce4fc8a`, merge del #13, creada el 2026-10-19). No hay releases de GitHub.
- **Última actualización:** 2026-11-25. Medido sobre `main` en `1329849` (merge del #51).
- **Estado general:** En desarrollo. La candidata RC1 está abierta y su acta de teléfono (`docs/PRUEBAS_RC1.md` §Acta) está vacía. PR2 (Ajustes) y PR3 (Reportes de nómina) siguen pendientes.
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

## 2. Estado de Diseño (UI / UX)

Fuente visual en el código: `src/constants/theme.ts` (paletas oscura y clara, Inter 400/500/600 en `FONT_FAMILY`, `theme.ts:383-385`). El repo no tiene wireframes ni mockups versionados. Los wireframes de flujo F1–F9 (2026-11-25) se generaron desde el código y no están en el repo. La columna «Estados» marca solo lo que se vio en el archivo de la pantalla; «sin auditar» quiere decir que no se revisó línea por línea, no que falte.

| Pantalla / Flujo | Wireframe | Mockup | UI en Código | Estados (Normal / Carga / Vacío / Error) | Notas |
| :--- | :---: | :---: | :---: | :---: | :--- |
| Arranque y gate (`app/index.tsx`, `app/(boot)/hydrating.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / n.a. / [x] | Gate `initialHref` (`app/index.tsx:14`, `src/core/initialRoute.ts:12`). Error de arranque con «Reintentar». |
| Alta, 5 pasos (`app/(onboarding)/*`) | [x] fuera del repo | [ ] | [x] | sin auditar | `STEPS` = welcome, disclosure, permissions, profile, ready (`app/(onboarding)/_layout.tsx:14`). Estado de permisos desde PermissionsHealthService. |
| Hoy (`app/(tabs)/index.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / botones `busy` / [x] / [x] | Vacío `EmptyState` (`index.tsx:308`). Banners de conflicto y de degradado (`:237`, `:267`). Única pantalla renderizada en un test (`app/(tabs)/__tests__/cancelDay.confirm.test.tsx`). |
| Historial (`app/(tabs)/history.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [ ] / [x] / [ ] | Solo se ve el vacío (`history.tsx:194`). No se encontró estado de carga ni de error en el archivo. |
| Reportes (`app/(tabs)/reports.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / parcial | Carga y vacío (`reports.tsx:143`, `:234`). Error de rango (`:230`). No se encontró un error de consulta (`preview.error` no se usa). |
| Ajustes (`app/(tabs)/settings.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / botones `busy` / [x] / [x] | Errores de campo (`settings.tsx:312-347`). Vacíos de cola y retención (`:380`, `:392`). **Sin copia de seguridad, exportación ni importación** (ver §3). |
| Detalle de sesión y rastro (`app/session/[id].tsx`, `trace.tsx`) | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / sin auditar | Carga (`[id].tsx:68`, `:177`). Sin datos (`:185`). |
| Periodo `/report/[periodId]` | [x] fuera del repo | [ ] | [x] | [x] / [x] / [x] / [x] | Carga, error y sin datos (`[periodId].tsx:43-53`), vacío (`:74`). **No se llega desde ninguna pantalla** (ver §3). |
| Expediente `/report/pack/[packId]` | [x] fuera del repo | [ ] | [x] | [x] / [x] / sin auditar / [x] | Carga (`[packId].tsx:37-40`). No existe: `NotFoundState`. |
| Destinos (`app/sites/*`) | [x] fuera del repo | [ ] | [x] | sin auditar | Vacío en la lista (`app/sites/index.tsx:45`). |
| Salud (`app/system/health.tsx`), Conflicto (`app/system/conflict.tsx`) | [x] fuera del repo | [ ] | [x] | sin auditar | Salud muestra la fila «Copia de expedientes» (`health.tsx:311-313`). |
| Soporte y práctica (`app/support/*`), Legal (`app/legal/*`) | [x] fuera del repo | [ ] | [x] | sin auditar | — |

- **Sistema de diseño / Tokens:** definido en código (`src/constants/theme.ts`, #44 y #50). No hay mockup versionado con el que compararlo.
- **Ajustes visuales abiertos:**
  - Contraste, TalkBack y aspecto en un teléfono: no verificados. Los PR #38 y #50 lo dicen.
  - «Ver detalles» y «Ocultar detalles» del hero usan un texto fijo de respaldo porque faltan `common.showDetails` y `common.hideDetails` en i18n (`src/components/ui/OperationalHeroCard.tsx:83-86`). El PR #53 está abierto y sin mergear.

## 3. Estado de Funciones y Lógica

### Completado y verificado
Verificado por tests y código el 2026-11-25. **Ningún punto de esta lista está probado en un teléfono.**
- **Arranque y gate:** hidratación, alta, aviso, conflicto y pestañas, en ese orden (`src/core/initialRoute.ts:12-24`). Test de `initialHref`: `src/services/domain/__tests__/pr2UserFlow12_3.test.ts`.
- **Alta y permisos (PHS):** 5 pasos. La ubicación precisa es obligatoria, y el segundo plano, la batería y las notificaciones se pueden omitir con aviso. Tests: `src/onboarding/__tests__/flow.test.ts`, `src/components/blocks/__tests__/PermissionsStep.test.tsx`, `src/services/runtime/__tests__/PermissionsHealthService.test.ts`, `src/utils/__tests__/permissionChain.test.ts`.
- **Jornada, máquina de estados e intenciones:** iniciar, llegar, pausa, almuerzo, salida, traslado y cierre, por `intentRouter` (`src/services/application/intentRouter.ts`) y `sessionMachine` (`src/services/domain/sessionMachine.ts`). Tests:
  - `app/(tabs)/__tests__/` (checkInOut, closeDay, lunch, cancelDay).
  - `src/services/domain/__tests__/sessionMachine.test.ts`, `pr2UserFlow12_3.test.ts`, `inicioJornada.blueprint.test.ts`.
  - `src/services/application/useCases/__tests__/startDay.test.ts`, `confirmExit.test.ts`.
- **Nómina de California:** OT diaria y semanal, doble tiempo y séptimo día (activos por defecto, `src/utils/companyPolicy.ts:8-12`), primas de comida y descanso, un almuerzo por día de nómina y tarifa congelada por jornada (`sessions.hourly_rate_snapshot`). Tests: `PayrollEngineService.test.ts`, `caRules.test.ts`, `mealPremium.test.ts`, `mealRules.test.ts`, `restRules.test.ts`, `dayLunch.test.ts`, `hourlyRateSnapshot.test.ts`, `policyV2.test.ts`.
- **Libro append-only y sello:**
  - Cadena SHA-256, manifiesto v5 (`src/core/contracts/evidence.ts:140`), firma Ed25519, `SESSION_SEALED` y `sessionReplay`.
  - Esquema SQLite v9 (`src/services/persistence/schema.ts:24`).
  - Tests: `IntegrityLedgerService.test.ts`, `HashChain.test.ts`, `EvidencePackService.test.ts`, `packSignature.test.ts`, `app/(tabs)/__tests__/sealVerify.flow.test.ts`, `ledgerIntegrity.test.ts`.
- **Reportes (lo que hay hoy):**
  - Rango semana actual, semana anterior, quincena, mes y fechas (`src/utils/reportRange.ts:9`).
  - PDF del rango sin sellar, `EXPORT_RANGE_PDF` (`reports.tsx:280`).
  - Sellar la semana, `SEAL_PACK`.
  - «Exportar expediente», `EXPORT_PACK` (`reports.tsx:130`): comparte el **comprobante del empleado** (`intentRouter.ts:268-279`), como confirmó el dueño.
  - «Compartir expediente empleador», `SHARE_EMPLOYER` (`reports.tsx:371`, `app/report/pack/[packId].tsx:138`): usa el correo si hay cliente y si no, la hoja de compartir.
  - Tests: `ReportService.test.ts`, `previewPayrollRange.test.ts`, `generateWeeklyPayroll.test.ts`, `reportPremium.test.ts`, `reportRange.test.ts`.
- **Ajustes:** perfil, monitoreo, destinos, zona admin con PIN, calendario, retención, soporte y legal (`app/(tabs)/settings.tsx`). Tests: `app/(tabs)/__tests__/settings.flow.test.ts`, `pin.flow.test.ts`, `src/services/runtime/__tests__/pinHash.test.ts`, `pinProvision.test.ts`, `SettingsService.test.ts`.
- **Destinos:** alta, ficha, radio válido y nombre del lugar desde el GPS (`reverseGeocodePoint`, `src/services/runtime/reverseGeocode.ts`). Tests: `SiteRegistryService.test.ts`, `reverseGeocode.test.ts`, `SiteRadiusField.test.tsx`, `siteRadius.test.ts`.
- **Cifrado de campos:** AES-GCM, migraciones y pérdida de clave. Tests: `FieldCryptoService.test.ts`, `cryptoMigrations.test.ts`, `keyLoss.test.ts`.
- **Idioma es/en:** paridad de claves y cambio en el acto. Tests: `src/i18n/__tests__/i18n.test.ts`, `languageSwitch.test.tsx`, `setLanguage.test.ts`, `hardcodedCopy.test.ts`.
- **Soporte y modo práctica aislado:** tests `src/support/__tests__/support.test.ts`, `src/services/application/__tests__/practiceIsolation.test.ts`.
- **Calidad estática:** `tsc` sin errores, eslint sin errores, 0 ciclos de importación (`dpdm -T`).

### En progreso
- **Copia de seguridad, exportación e importación en Ajustes (PR2):** **no existen hoy.**
  - No hay ninguna intención `IMPORT` ni `RESTORE` en `src/core/contracts/intents.ts`, y Ajustes no tiene esa sección.
  - Lo que hoy se llama «Copia de expedientes» es un aviso de expedientes sin compartir (`selectBackupAdvice`). Se ve en Reportes, en el expediente y en Salud (`health.tsx:311-313`).
  - El dueño aprobó la separación: Reportes para documentos de nómina, Ajustes para la copia restaurable.
  - *Falta:* todo el PR2.
- **Reportes de nómina con «Vista previa», «Exportar expediente» y «Enviar por correo», y Auditoría de jornadas (PR3):**
  - Las acciones de exportar y enviar ya existen (ver arriba).
  - La ruta `/report/[periodId]` existe y funciona como pantalla (`app/report/[periodId].tsx`), pero **nada lleva a ella**: no hay `router.push` hacia esa ruta en `app/` ni en `src/`. Reportes solo abre `/report/pack/[packId]` (`reports.tsx:137`, `:372`).
  - *Falta:* la entrada «Vista previa» y la sección Auditoría de jornadas.
- **Claves i18n `common.showDetails` y `common.hideDetails`:** el PR #53 está abierto. Hoy se usa el texto de respaldo (`OperationalHeroCard.tsx:85-86`).

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
  - **No se generó un APK de `1329849`**: hoy no hay build de Android ni de iOS de este commit.
  - Los 14 APK previos que hay fuera del repo (versionCode 1–16) son de commits anteriores.
- **Pruebas automatizadas:** 1081/1081 tests y 146/146 suites en verde, 2/2 snapshots (jest 29.7, 2026-11-25, `1329849`). Eslint: 0 errores y 4 avisos. `dpdm -T`: 0 ciclos.
- **Pruebas manuales:** el repo no tiene actas firmadas.
  - `docs/PRUEBAS_RC1.md` §Acta y las tablas de `docs/PRUEBAS_DISPOSITIVO.md` están vacías.
  - `docs/PRUEBA_CAMPO_1.md`–`8.md` son listas de pasos, sin resultados anotados.
- **Errores abiertos:**
  - `[Severidad: Alta]` **Permisos fuera de las reglas del dueño en los APK.**
    - Los 14 APK revisados declaran `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` y `WRITE_EXTERNAL_STORAGE`. Se leyó su `AndroidManifest.xml` con `pyaxmlparser`.
    - El último tiene versionCode 16 y salió del commit `61371eb`, de la rama del PR #37, que está cerrado.
    - `app.json` no tiene `android.blockedPermissions` (`app.json:35-46`). `expo-file-system` declara los dos de almacenamiento (`node_modules/expo-file-system/android/src/main/AndroidManifest.xml`).
    - **No verificado en un build de `main` actual.**
    - El dueño pidió no bloquear por ahora los permisos de almacenamiento. Sobre `SYSTEM_ALERT_WINDOW` no hay decisión.
  - `[Severidad: Media]` **Documentación que contradice al código sobre doble tiempo y séptimo día.** El código los aplica por defecto: `DEFAULT_LEGAL_FLAGS` (`src/utils/companyPolicy.ts:8-12`), con el test R03 en `caRules.test.ts:31`, desde el #35. Dicen lo contrario:
    - `README.md:302`, `:308-309`.
    - `docs/PRUEBAS_RC1.md:64`.
    - `docs/AUDITORIA_CALCULOS_Y_OPERACION.md:102`.
    - La limitación conocida del RC1 en `CHANGELOG.md`.
  - `[Severidad: Baja]` **Comentario de `app.config.ts`** («El último preview fue versionCode 3»): existe un APK con versionCode 16.
  - `[Severidad: Baja]` **Estados sin cubrir:** Historial no tiene estado de carga ni de error, y Reportes no muestra el error de consulta (§2). Va contra `AGENT.md` §3 («Estados obligatorios»).

## 5. Pendientes Priorizados
1. **PR2, copia, exportación e importación en Ajustes.** Se cierra cuando:
   - La copia se cree y se restaure solo desde Ajustes.
   - Los tests de ida y vuelta pasen.
   - La importación reemplace todo y no rompa la cadena del libro.
2. **PR3, Reportes de nómina.** Se cierra cuando:
   - «Vista previa» lleve a `/report/[periodId]`.
   - La Auditoría de jornadas esté definida por el dueño y testeada.
3. **Decidir `SYSTEM_ALERT_WINDOW` y los permisos de almacenamiento, y verificarlo en un build.** Se cierra con la lista de permisos de un APK de `main` (`aapt` o `pyaxmlparser`) que coincida con la decisión.
4. **Alinear la documentación sobre doble tiempo y séptimo día con el código, o el código con la decisión legal.** Se cierra cuando README, `docs/` y `CHANGELOG.md` coincidan con `DEFAULT_LEGAL_FLAGS`.
5. **Acta RC1 en un teléfono** (Android, Samsung S22+). Se cierra con la tabla de `docs/PRUEBAS_RC1.md` §Acta rellenada sobre un build identificado.

## 6. Bloqueos y Confirmaciones Pendientes
- **Bloqueos:**
  - **Auditoría de jornadas sin definir.** La respuesta del dueño llegó vacía después de «debe mostrar:», y eso bloquea el contenido del PR3.
  - **`/report/[periodId]` sin entrada** hasta el PR3.
  - **Ninguna verificación en un APK de `main` actual.** Permisos, geocerca, servicio en primer plano, notificaciones, PDF y contraste dependen de un build y de un teléfono.
  - **Permisos amplios de almacenamiento** (`expo-file-system`) sin bloquear, por decisión del dueño («No bloquees los permisos por ahora»).
- **Por confirmar:**
  - Qué hacer con `SYSTEM_ALERT_WINDOW` en el manifiesto (ver §4).
  - Si doble tiempo y séptimo día deben estar activos por defecto. El código lo hace desde el #35 y los documentos legales dicen «apagados hasta asesoría legal».
  - Nombre del archivo de bitácora: la regla 5 del dueño cita `CHANGE-LOGS.md`, pero `AGENT.md` §5 y el repo usan `CHANGELOG.md`. No se creó `CHANGE-LOGS.md`.
  - `AGENT.md` §1–§3 siguen como plantilla, con los campos entre corchetes sin rellenar.
  - Si la etiqueta `v0.1.0` cuenta como versión entregada (ver §3).
