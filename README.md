# Dual Tracker V1.0.0

Aplicación de evidencia laboral y nómina para trabajadores de California. El expediente es de grado forense: la jornada deja un rastro que se puede recomputar, y el comprobante sale de un periodo sellado. Stack: TypeScript, **Expo SDK 54** (`expo` ~54.0.35), **React Native 0.81.5**, **expo-router 6**. El producto se prueba y se documenta primero en **Android** (servicio en primer plano, geocerca y la guía de permisos, incluida Samsung). iOS está en el proyecto (`npm run ios` y los perfiles EAS). La candidata 1.0.0-rc.1 no tiene acta de iPhone, y el hallazgo de actualizaciones diferidas en iOS sigue sin medirse en un iPhone (`CHANGELOG.md`).

Consolida código de los proyectos fuente anteriores **W Tracker**, **LEDTracker** y **GEOTrack (WTracker Trial_and_TraceT)**. Esos nombres no son el de esta app: el producto es **Dual Tracker V1.0.0**. Dos garantías:

- **Tu tiempo**: horas, almuerzo, traslados y horas extra calculados con una política visible y versionada (`CA_DAILY8_WEEKLY40_V1` por defecto).
- **Tu rastro de jornada**: hechos espaciales (geocerca y, opcionalmente, miga de pan) registrados solo con la jornada abierta. Sirven de evidencia compartida entre empleado y empleador, con el mismo hash.

La interfaz está en español y en inglés. La estructura sigue las dos propuestas del proyecto, que son la fuente de verdad:

1. **PROPUESTA TÉCNICA – Arquitectura de servicios para Dual Tracker** (`DualTracker_ServiceLayer`), citada aquí como *Técnica §n*.
2. **PROPUESTA DE PRODUCTO – CAPA APP: Directorio app/ y blueprints de vistas**, citada aquí como *Producto §n*.

## Qué cubre el código vigente

- **Jornadas con geocerca.** Llegada y salida con la jornada abierta (`GeofenceRuntimeService`). Un fix no fiable pide confirmación. Una ubicación simulada (`LocationObject.mocked`) no ficha sola y queda en el libro.
- **Libro append-only, SHA-256.** `ledger_entries` aborta `UPDATE` y `DELETE` (`trg_ledger_no_update`, `trg_ledger_no_delete` en `src/services/persistence/schema.ts`). El hash de un eslabón es `sha256(prevHash + payloadCanónico)` (`src/services/evidence/HashChain.ts`).
- **Expediente firmado, manifiesto v5.** `PACK_MANIFEST_VERSION = 5` en `src/core/contracts/evidence.ts`. La firma Ed25519 cubre el cuerpo canónico y no entra en `packHash` ni en `contentHash`. Sin llavero el sello sigue y añade `PACK_UNSIGNED`.
- **Comprobante claro (PDF).** Plantilla `DOCUMENT_VERSION = 3`. El tema por defecto es claro (`documentTheme` ausente, o distinto de `"dark"`). El QR es el `packHash`, sin URL ni red, a 96 px (`src/services/evidence/qrSvg.ts`). La firma Ed25519 va en un recuadro (`data-signature`). `documentVersion`, `documentTheme` y `documentLocale` quedan fuera de los dos hashes.
- **Traslados, incluido el cancelado.** El tramo entre dos destinos de la misma jornada se congela al cerrarlo. Uno cancelado nuevo queda `paid: true`, `rateMultiplier: 1` y `countsTowardOvertime: false` (`sessionMachine`). El comprobante lo pinta como «Tránsito (cancelado)». Un cancelado legado (`paid !== true`) no genera esa línea: ese tiempo sigue como trabajo en el sitio.
- **Señales de riesgo, asentadas y sin recortar el pago.** Anomalías, ubicación simulada, integridad del dispositivo, cobertura y `sessionReplay` se escriben como evidencia y no cambian la nómina ni bloquean el fichaje (`anomalyEngine`: no borra hechos, no bloquea fichajes y no toca la nómina). Ubicación, servicio en primer plano y reloj sí pueden impedir VALIDADA (`src/core/healthPolicy.ts`). No reescriben minutos ya calculados. Batería, avisos y la ubicación aproximada de Android 12+ avisan y no bajan el pago.
- **Español e inglés.** El chip aplica el idioma en el acto. `en.ts` y `supportEn.ts` tienen la misma forma que el español; `src/i18n/__tests__/i18n.test.ts` exige esa paridad.

En `main`, después del README del PR #28, entraron la tarifa congelada por jornada (schema v8, PR #29) y cuatro cambios de presentación y de robustez que no tocan el cálculo, la máquina de estados, los hashes del libro ni el sello: #30, #31, #32 y #33. El detalle está en «Hecho en», más abajo.

---

## Puesta en marcha

```bash
npm install
npm start               # expo start: development build (expo-dev-client); Expo Go: --go, pero no sirve para geocerca/segundo plano
npm run android         # expo start --android
npm run ios             # expo start --ios
npm run web             # expo start --web
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint (incluye la regla de imports prohibidos en app/)
npm run doctor          # npx expo-doctor
npm run check:dates     # scripts/check-dates.ts, camino sin Intl (Hermes)
```

> La geocerca, la ubicación en segundo plano, el servicio en primer plano y las tareas en segundo plano necesitan un **development build** (`npx expo run:android` / `npm run build:android:dev`). En Expo Go funcionan de forma limitada o no funcionan.

### Builds para equipos reales (EAS)

`eas.json` define cuatro perfiles: `development` (dev client), `preview` (build de release interno: APK en Android, ad hoc en iOS; es el que se usa para la matriz D1–D15; `autoIncrement`), `preview-d11` (variante aislada `com.bdevdpaz.dualtracker.d11` con el llavero forzado a fallar, solo para D11; también `autoIncrement`) y `production` (AAB / App Store, `autoIncrement`). Además, `preview-simulator` para el simulador de iOS (hereda `autoIncrement` de `preview`).

```bash
npm run build:android:preview   # APK para instalar a mano en el Android
npm run build:ios:preview       # ad hoc: requiere Apple Developer de pago y `eas device:create`
npm run build:android:d11       # solo D11 (se instala al lado como «Dual Tracker D11»)
npm run build:ios:d11           # la misma variante D11 en iOS
npm run build:android:dev       # development build
```

Configuración única (`eas login`, `eas init`), instalación en Android y iPhone, variante D11 y su doble cerrojo: **[docs/BUILD.md](docs/BUILD.md)**. `app.config.ts` extiende `app.json` (versión **1.0.0**). Sin `APP_VARIANT` no cambia ids ni nombre; el perfil `preview` añade `extra.releaseChannel` = `RC1`. Historial: [CHANGELOG.md](CHANGELOG.md). Plan de teléfono de la candidata: [docs/PRUEBAS_RC1.md](docs/PRUEBAS_RC1.md).

No hace falta `babel.config.js`: en SDK 54, `babel-preset-expo` se aplica por defecto e incluye el plugin de reanimated/worklets.

## Expediente: contentHash, idempotencia y verificación

- **Manifiesto v2** (`manifestVersion: 2`, `PACK_MANIFEST_VERSION`): añade `contentHash` = SHA-256 (expo-crypto, `canonicalJson`: claves ordenadas, sin `undefined`, fechas en epoch ms, no finitos → `null`) del contenido del periodo: el `PayrollStatement` sin `packHash` + la evidencia de sesiones (asientos con `sessionId`, trazas, conflictos). Excluye lo volátil de cada sello: `packId`, `sealedAtMs`, `ledgerHeadHash`, `ledgerChainValid` (estado global de la cadena) y los asientos sin sesión (`PAYROLL_SEALED` de sellos previos). `packHash` sigue siendo el hash del manifiesto completo y ahora incluye `manifestVersion` y `contentHash`; `statementHash` no cambia.
- **Manifiesto v3** (FieldCrypto v1.3 §15): añade `sealWarnings: { code: "FIELD_CRYPTO_KEY_LOST"; sessionIds }[]` (vacío si no hay). Es contexto del dispositivo en el momento del sello: entra en `packHash` y **no** en `contentHash`, así que un resello tras perder la clave reutiliza el pack existente. El PDF y el detalle del pack muestran la advertencia.
- **Manifiesto v4** (versión anterior): misma semántica de `packHash` y `contentHash` que v3, más una firma Ed25519 del cuerpo canónico (`{ ...cuerpoDePackHash, packHash }`). La firma no entra en ninguno de los dos hashes. Lleva `algorithm`, `keyId` y la clave pública. Sin llavero el sello sigue y añade `PACK_UNSIGNED` (eso sí entra en `packHash`). Un v4 que nació firmado y llega sin firma falla con `SIGNATURE_MISSING`. El sello con `PACK_UNSIGNED`, y los packs v1–v3, siguen como `unsigned-v1` cuando los hashes cuadran. Cómo comprueba el empleador: `docs/CONFIABILIDAD_TANDA1.md` y `docs/AUDITORIA_2026-10-20.md` (A2).
- **Manifiesto v5** (`PACK_MANIFEST_VERSION = 5` en `src/core/contracts/evidence.ts`): el vigente. Añade al `packHash` la identidad del build (`appVersion`, `versionCode`, `gitCommit`) y la zona de cada sesión (`sessionTimeZones`). Esas claves no están en el cuerpo de un v1–v4, así que un sello anterior sigue verificando. No cambia el `contentHash` de un pack que no traiga `transitSegments` ni `prevHash` en los eslabones. En un sello nuevo, y solo si la clave está en el expediente, el contenido también puede llevar tramos (`transitSegments`), sellos de jornada (`sessionSeals`), confianza de la ubicación (`locationTrust`), integridad del dispositivo (`deviceIntegrity`), cobertura (`monitoringCoverage`) y la reconstrucción (`sessionReplay`). Cada eslabón exportado trae `prevHash` y `payloadJson` para recomputar `sha256(prevHash + payloadJson)` sin la base del teléfono. La plantilla del PDF es otra versión: `DOCUMENT_VERSION = 3` en el mismo archivo (ausente o 1 = HTML heredado; 2 = comprobante premium; 3 = ese premium más el anexo de tramos y la identidad del build en el pie). `documentVersion`, `documentTheme` y `documentLocale` quedan fuera de `packHash` y de `contentHash`.
- **Verificación** (`EvidencePackService.verify` en `src/services/evidence/EvidencePackService.ts`): recomputa `statementHash`, `evidenceHash`, `contentHash` y `packHash` y comprueba que `statement.packHash` coincide. En v4 y v5 con firma, comprueba Ed25519 y, si hay ancla (el llavero de este teléfono o la que pasa quien verifica), que la clave coincida. Si la firma cuadra y no hay ancla usable, la identidad queda `unverified` (`IDENTITY_UNVERIFIED`). En v5 recomputa la cadena exportada (`LEDGER_EXPORT`, `LEDGER_HASH`, `LEDGER_LINK`) y el `sessionHash` de `SESSION_SEALED` cuando el pack lo trae (`SESSION_HASH`, `src/services/evidence/sessionSeal.ts`). En el teléfono, `sessionReplay` (`src/services/domain/sessionReplay.ts`) compara los minutos del libro con la fila viva; un desajuste añade `SESSION_REPLAY` y no reescribe la nómina. Un paso que no se puede repetir queda `INCOMPLETE` y no falla la verificación. Devuelve `{ valid, legacy, scheme, identity, identityNote, failures[] }`.
- **Packs legados** (v1, sin `manifestVersion` ni `contentHash`): se verifican con el formato antiguo de `packHash` y sin comprobación de contenido (`legacy: true`). A un v2 no se le puede "degradar" a legado quitándole campos: su `packHash` deja de cuadrar. Un pack legado nunca se reutiliza.
- **Idempotencia**: con la cadena sana, sellar un periodo cuyo `contentHash` coincide con el del pack más reciente del mismo periodo devuelve ese pack (`reused: true`) sin `packId`, PDFs ni asiento nuevos; el router emite `PACK_REUSED` ("El expediente ya estaba sellado con este mismo contenido; se reutilizó."). Si el libro está roto, el sello responde `LEDGER_BROKEN` y no reutiliza. No existe revocación de packs en el modelo actual, así que "no revocado" = cualquiera (TODO si se añade).
- **Reemisión explícita** (`reissue: true` en `EvidencePackService.seal` / `SEAL_PACK`): única forma de obtener dos packs distintos con contenido idéntico (PDF perdido, reenvío formal). Queda auditada en el ledger como `PACK_REISSUED` con `reissueOf`. Se prefirió a "sellar en otro contexto" porque es intencional, visible en el ledger y no depende de efectos colaterales.

## Pruebas (Jest)

Según la *Propuesta de integración de Jest*: se prueban las autoridades (dominio, evidencia, persistencia, runtime por contrato de handler), los flujos críticos de `app/` y un conjunto amplio de componentes.

```bash
npm test               # jest --runInBand --watchman=false (suite completa)
npm run test:domain    # domain + application + evidence
npm run test:coverage  # cobertura (umbral suave: 60 % statements en domain y evidence)
npm run test:watch     # modo watch
npm run gm             # typecheck && lint && test:domain && expo-doctor  (puerta de merge)
```

**Termux / Android:** usar siempre `--runInBand` (un solo proceso; los workers de Jest se quedan sin memoria o sin `fork` fiable) y `--watchman=false` (watchman no existe en Termux; Jest usa el rastreador de Node). Los scripts ya los llevan; si lanzas `npx jest` a mano, añádelos: `npx jest --runInBand --watchman=false <ruta>`.

- `jest.config.ts`: preset `jest-expo`, `testMatch **/__tests__/**/*.test.ts?(x)`, `TZ=UTC`, `clearMocks`/`restoreMocks`, cobertura de `src/services`, `src/core`, `src/utils` (sin `reportTemplates.ts`).
- `test/setup.ts`: reloj fijo `2026-09-26T15:00:00.000Z` (`test/time.ts`: `time.set`, `time.travel`, `time.jumpWall` para simular deriva), reset de candados del ConcurrencyGuard y del anti-rebote de geocerca, SQLite en memoria recreada por caso, dobles de Expo cableados aquí.
- `test/mocks/`: un doble por módulo. `expo-sqlite` es SQLite real en memoria (sql.js), así los triggers append-only del ledger y `checkOverlap` se prueban de verdad.
- `test/fixtures/`: `SessionRecord`, `SpatialFact`, `PayrollStatement`, `LedgerEntry` tipados con los contratos (sin `any`).
- `__tests__/` colocados por capa. Medido con `npm test` (`jest --runInBand --watchman=false`): **135 archivos** (`**/*.test.ts` y `**/*.test.tsx`, fuera de `node_modules`), **135 suites**, **942 tests** y **2 snapshots**, todos en verde. Los componentes cubiertos van más allá de `IntegrityBadge`, `StatusPill` y `SessionTimeline`: `src/components/ui`, `src/components/brand`, `src/components/blocks`, `src/components/feedback`, `src/components/modals`, `src/components/sites` y `src/components/trace`, más ocho flujos de `app/` (fichar, cerrar, almuerzo, sellar, ajustes, PIN, edición y cuarentena).
- Correspondencia de nombres de la propuesta: `california-daily-8-weekly-40` = `CA_DAILY8_WEEKLY40_V1`; `PersistenceService.updateStatus` (no existe) = cualquier `updateSession`/`insertSession` fuera de `SessionEngineService.dispatch`; `PATCH_SESSION` (vista) = `MANUAL_PATCH` (motor); `CERRADA`, `intentRouter`, `startDay`… existen con ese nombre.
- Ya no queda ningún `test.failing`: el de cifrado de campos pasa desde C2 (spec FieldCrypto v1.3 §17 #3).
- Estático (`src/core/__tests__/staticGuards.test.ts`): `FieldCryptoService` solo se importa desde `src/services/persistence/**` y `src/core/boot.ts`; `LoggingService` no recibe campos sensibles; Jest resuelve los subpaths `.js` de `@noble`.
- Matriz de dispositivo D1–D15 (spec §18): checklist en `docs/PRUEBAS_DISPOSITIVO.md`; builds para ejecutarla en `docs/BUILD.md`.
- Pruebas de campo en teléfono: `docs/PRUEBA_CAMPO_1.md`, `docs/PRUEBA_CAMPO_2.md`, `docs/PRUEBA_CAMPO_3.md`, `docs/PRUEBA_CAMPO_4.md`, `docs/PRUEBA_CAMPO_5.md`, `docs/PRUEBA_CAMPO_6.md`, `docs/PRUEBA_CAMPO_7.md` y `docs/PRUEBA_CAMPO_8.md`.
- Build (`src/core/__tests__/buildConfig.test.ts`): solo `preview-d11` fija `EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE` y siempre con `APP_VARIANT=d11`; `app.config.ts` rechaza la bandera en cualquier otra variante; `keyStore` solo la obedece en la variante d11.
- `npm run check:dates` (`scripts/check-dates.ts`) se mantiene para el camino **sin Intl** en Hermes real; su equivalente Node vive en `src/utils/__tests__/dateUtils.test.ts`.
- Jest no sustituye la matriz de dispositivo: permisos reales, Foreground Service y geocerca en hardware siguen siendo prueba manual / Maestro.

---

## Estructura

```
dual-tracker/
├── app/                         ← Expo Router (raíz del proyecto, junto a src/) — 36 rutas, sin `__tests__` (Producto §2)
│   ├── _layout.tsx              fuentes Inter, Theme/Toast, FeedbackBridge, boot(), registro de tareas
│   ├── index.tsx                gate: hidratación → onboarding → descargo → tabs
│   ├── +not-found.tsx  +html.tsx
│   ├── (boot)/                  _layout, hydrating
│   ├── (onboarding)/            _layout (progreso 4 pasos), welcome, disclosure, permissions, profile
│   ├── (tabs)/                  _layout, index (Hoy), history, reports, settings
│   ├── session/                 _layout, [id], [id]/trace
│   ├── sites/                   _layout, index, new, [id]
│   ├── report/                  _layout, [periodId], pack/[packId]
│   ├── support/                 _layout, index, guide/[id], practice
│   ├── system/                  _layout (modal), health, conflict
│   └── legal/                   _layout, disclosure, retention
├── modules/                     nativos locales (package.json → expo.autolinking.nativeModulesDir = ./modules)
│   ├── device-integrity/        opciones de desarrollador y rutas de root
│   └── device-uptime/           reloj de arranque del sistema
├── src/
│   ├── config/                  provisional.ts (cifras provisionales), employerKeyAnchor.ts
│   ├── core/
│   │   ├── contracts/           SessionRecord, SpatialFact, LedgerEntry, PayrollStatement, evidence.ts
│   │   │                        (PACK_MANIFEST_VERSION = 5), monitoring.ts, intents, estado… (Técnica §9)
│   │   ├── store/               store reactivo + acciones (portado de GEOTrack)
│   │   ├── selectors/           derivaciones puras para las vistas (getSessionStateUI, rollups, conflicto…)
│   │   ├── hooks/               useWorkTracker (exporta también useClock y useQuery), usePractice,
│   │   │                        useScreenRefresh (useAutoRefresh, usePullToRefresh), useBusyAction
│   │   ├── refresh/             dataRevision, weekCursor
│   │   ├── boot.ts              ensureRuntimeReady(), boot(), registerBackgroundTasks()
│   │   ├── healthPolicy.ts      qué sensor bloquea VALIDADA
│   │   ├── monitoringState.ts   estado derivado de monitoreo
│   │   ├── monitoringCoverage.ts  cobertura informativa de la jornada
│   │   ├── locationTrust.ts     puntaje 0–100 de la ubicación
│   │   └── deviceIntegrityAssess.ts  lectura de emulador, root y opciones de desarrollador
│   ├── services/                DualTracker_ServiceLayer — catálogo de 23 servicios (Técnica §6, src/services/index.ts)
│   │   ├── domain/              SessionEngine, PayrollEngine (+payrollPolicies, payrollDisplay, segmentation,
│   │   │                        periodSlice, policyValidation), IntegrityLedger, SiteRegistry, siteMinutes, siteVisits,
│   │   │                        TransitPolicy, transitExport, ConcurrencyGuard, DualDisclosure, sessionMachine,
│   │   │                        sessionReplay, sessionTimeGuard, arrivalDwell
│   │   ├── evidence/            TimeAuthority, HashChain, TraceRecorder, Report (+reportTemplates, reportPremium, qrSvg),
│   │   │                        EvidencePack, packSignature, sessionSeal, clockSample, deviceOffGap, retentionRules, traceGaps
│   │   ├── runtime/             GeofenceRuntime, TaskOrchestrator, ForegroundWork, PermissionsHealth, Notification,
│   │   │                        Security, geofencePolicy, geofenceDiag, monitoringRecovery, monitoringSnapshot,
│   │   │                        serviceHealth (tabla service_health), heartbeat, operationalHealthLedger,
│   │   │                        anomalyCatalog, anomalyEngine, deviceIntegrity, deviceUptime, bootResume,
│   │   │                        criticalNotices, mockLocationNotice, orphanSession, pinHash, pinProvision, keyFingerprint
│   │   │   └── tasks/           geofence, breadcrumb, sessionWatchdog, exitDecisionTimer, dailyReminder,
│   │   │                        integritySweep, payrollExport, headless
│   │   ├── persistence/         Persistence (SQLite WAL, schema, mappers), Settings, Logging, OfflineQueue, FieldCrypto,
│   │   │                        cryptoCodec, cryptoMigrations, keyStore, employerPortal, foreignKeyMigration
│   │   ├── application/         Feedback, intentRouter, refreshMirror, useCases/ (startDay, confirmExit,
│   │   │                        generateWeeklyPayroll, calendarChange, policyMigration, ledgerIntegrity,
│   │   │                        provisionAdminPin, exportSupportDiagnostic, fieldCryptoHealth)
│   │   └── index.ts             catálogo canónico (los módulos de al lado no suman un servicio 24)
│   ├── support/                 catalog, practice, tips, memory, diagnostic, contentVersion, types, buildLabel, versionLine
│   ├── components/
│   │   ├── ui/                  design system (portado de GEOTrack): OperationalHeroCard, SystemHealthBlock,
│   │   │                        SessionTimeline, IntegrityBadge, StatusPill, ModalShell, PageHeader, Button, Input,
│   │   │                        Card, Chip, Banner, GlassSurface, VmacSheet, SealAnimation, PracticeWatermark,
│   │   │                        DocumentPreviewWidget, EmptyState, LiveShiftPanel, DailySummaryBlock,
│   │   │                        GpsExceptionCard, NotFoundState, LoadingState, keyboard, motion, responsive
│   │   ├── brand/               PinClockMark, ArrivalMark, BrandHeaderTitle
│   │   ├── sites/               SiteRadiusField
│   │   ├── support/             HelpButton, LanguageSwitch, ScreenTips, Walkthrough
│   │   ├── trace/               TracePlane (plano local, sin teselas)
│   │   ├── modals/              DailySetupModal, ExitDetectionModal, LunchModal, EditSessionModal,
│   │   │                        DeleteSessionModal, AddNoteModal (Producto §7), ConfirmActionModal
│   │   ├── blocks/              ScreenStatusBanner, PermissionCard, PermissionGuidancePanel, PermissionsStep,
│   │   │                        HealthRow, KeyValueRow, SessionListItem, BackupAdviceCard, OrphanReviewCard
│   │   ├── feedback/            FeedbackBridge (FeedbackService → toast / diálogo)
│   │   └── legal/               DisclosureContent (compartido por onboarding y legal/)
│   ├── i18n/                    es.ts (base), en.ts (completo), supportEs.ts, supportEn.ts, microcopy.ts,
│   │                            legal.ts (descargo/retención versionados), locale.ts
│   ├── constants/               theme, icons, animations, geolocation, notifications, tasks, security, flags, app, uiLiterals
│   ├── context/                 ThemeContext, ToastContext
│   └── utils/                   dateUtils (dayjs tz), geoUtils, canonicalJson, safeFileName, serializeError,
│                                hhmm, localPlane, reportRange, companyPolicy, permissionChain,
│                                permissionGuidance, siteRadius
├── assets/images/               icon, splash, adaptive-icon, favicon, notification (marca A y D)
├── assets/brand/                SVG fuente A y D; se regeneran con scripts/brand/build.py
├── docs/                        28 archivos
│                                AUDITORIA_2026-10-20.md, AUDITORIA_2_2026-10-20.md, AUDITORIA_3_2026-10-20.md,
│                                AUDITORIA_CALCULOS_Y_OPERACION.md, AUDITORIA_DESTINOS_Y_TRASLADO.md,
│                                BUILD.md, COMPROBANTES_PREMIUM.md, CONFIABILIDAD_TANDA1.md, IDIOMA.md,
│                                PIN_APROVISIONAMIENTO.md, PORTAL_EMPLEADOR.md,
│                                PRUEBA_CAMPO_1.md, PRUEBA_CAMPO_2.md, PRUEBA_CAMPO_3.md, PRUEBA_CAMPO_4.md,
│                                PRUEBA_CAMPO_5.md, PRUEBA_CAMPO_6.md, PRUEBA_CAMPO_7.md, PRUEBA_CAMPO_8.md,
│                                PRUEBAS_DISPOSITIVO.md, PRUEBAS_GEOCERCA.md, PRUEBAS_MULTI_DESTINO.md, PRUEBAS_RC1.md,
│                                SOPORTE.md, TANDA2.md, UI_PREMIUM.md, UI_SISTEMA_VISUAL.md, VALORES_PROVISIONALES.md
├── scripts/                     check-dates.ts, provision-admin-pin.ts, sample-comprobantes.ts, brand/ (build.py)
├── app.json  app.config.ts      config base + variante de build (APP_VARIANT=d11)
├── eas.json                     perfiles development / preview / preview-simulator / preview-d11 / production
├── package.json  tsconfig.json  eslint.config.js  expo-env.d.ts
```

### Cómo se relacionan las capas

```
 app/ (rutas: presentación pura)
   │  useWorkTracker() → { state, emit(ViewIntent), queries }      + selectores puros
   ▼
 src/core  (store, selectors, hooks, boot)
   │  emit → routeIntent (application/intentRouter)
   ▼
 application  ── useCases (startDay, confirmExit, generateWeeklyPayroll), FeedbackService
   ▼
 domain  ── SessionEngine (ÚNICA autoridad del ciclo de vida) · PayrollEngine · IntegrityLedger
            SiteRegistry · TransitPolicy · ConcurrencyGuard · DualDisclosure
   │  puertos inyectados en boot.ts (el dominio no importa TaskManager, Location ni Print)
   ▼
 evidence ── TimeAuthority (único lector del reloj) · HashChain · TraceRecorder · Report · EvidencePack
 runtime  ── GeofenceRuntime · ForegroundWork · TaskOrchestrator (+tasks) · PermissionsHealth · Notification · Security
 persistence ── Persistence (SQLite WAL) · Settings · Logging · OfflineQueue · FieldCrypto
```

El catálogo sigue siendo de 23 servicios (`src/services/index.ts`). `sessionSeal`, `sessionReplay`, `arrivalDwell`, `monitoringRecovery`, `serviceHealth`, `bootResume`, `criticalNotices` y `anomalyCatalog` viven en esas capas y no añaden un nombre al catálogo. `app/` sigue sin importar servicios.

Reglas que se cumplen en el código:

- **Una ruta es un caso de uso.** Las rutas no contienen reglas de nómina, geocerca ni persistencia. No importan `expo-sqlite`, `expo-location`, `expo-print` ni `src/services/*`. `eslint.config.js` lo impone con `no-restricted-imports` sobre `app/**`.
- **Toda mutación es una intención** (`ViewIntent`: START_DAY, CONFIRM_EXIT, PATCH_SESSION, SEAL_PACK…). `intentRouter` traduce las del ciclo de vida a `SessionIntent` mediante la tabla `VIEW_TO_SESSION_INTENT`. Las demás las atiende el servicio dueño.
- **Solo SessionEngine muta la jornada.** La geocerca, las notificaciones y la UI emiten hechos o intenciones.
- **Tiempo canónico.** Todo timestamp de nómina o auditoría sale de `TimeAuthorityService.now()`.
- **Evidencia antes que conveniencia.** Una edición manual guarda los tiempos originales (`bookkeeping.original`), pasa la sesión a MANUAL y deja asiento en el ledger encadenado por hash.
- **Estados de pantalla obligatorios** (`loading / empty / degraded / conflict / ready`). Se resuelven con `ScreenStatusBanner`.
- **Copy en i18n.** Las rutas no llevan strings legales en duro. El descargo y la retención los sirve `DualDisclosureService` (`src/i18n/legal.ts`, versión `2026-10-v2`). El inglés está completo: `src/i18n/en.ts` y `src/i18n/supportEn.ts` tienen la misma forma que el español, y `src/i18n/__tests__/i18n.test.ts` exige esa paridad (claves, parámetros y cadenas no vacías). `t()` consulta el español si una clave inglesa faltara; la suite no deja ese hueco.

---

## Qué se portó y desde qué app

W Tracker, LEDTracker y GEOTrack son proyectos fuente anteriores, no el nombre de esta app. El producto es Dual Tracker V1.0.0.

| Origen | Portado a | Notas |
|---|---|---|
| **GEOTrack** | `src/components/ui/*`, `constants/theme`, `icons`, `animations` | El design system salió de GEOTrack. Los tokens vigentes son Dual Tracker V1.0.0 (`src/constants/theme.ts`): Inter 400/500/600; fondo `#0E0E0E`, tarjetas `#121212`, elevados y campos `#1E1E1E`, borde `#2A2A2A`; relleno primario `#F6C452` con texto `#1C1B19`; texto dorado en claro `#7A5D0A`; info `#4A90E2`, éxito `#5CD65C`, aviso `#F8C650`, peligro `#D9534F`, gris `#A8A9AB`. El nombre del producto es Dual Tracker V1.0.0. Se quitaron los nombres en duro ("GEOTrack Solutions Inc."). |
| **GEOTrack** | `core/store`, `core/selectors`, `core/hooks/useWorkTracker` | Suscripción reactiva real. `dispatch(DomainEvent)` pasa a ser `emit(ViewIntent)`. |
| **GEOTrack** | `domain/sessionMachine`, `SessionEngineService` | Transiciones de jornada, almuerzo, traslado, salida, auto-cierre de 12 h, anti-rebote. Estados en español (NO_INICIADA…CERRADA). |
| **GEOTrack** | `persistence/PersistenceService`, `schema`, `mappers` | SQLite WAL, migraciones, `checkOverlap`, borrado lógico. |
| **GEOTrack** | `runtime/GeofenceRuntimeService`, `tasks/geofence.task.ts` | Identificadores de región, validadores de precisión, debounce de salida pendiente en KV. |
| **GEOTrack** | `runtime/NotificationService`, `tasks/dailyReminder.task.ts` | Categoría de salida con acciones, recordatorio diario. |
| **GEOTrack** | `runtime/TaskOrchestratorService`, `sessionWatchdog`, `integritySweep` | Registro global de tareas, BackgroundTask, heartbeat. |
| **GEOTrack** | `evidence/ReportService`, `reportTemplates` | HTML → PDF con expo-print, compartir y email. Ahora a partir de un `PayrollStatement` sellado, con escape-html. |
| **GEOTrack** | `i18n`, `context/Toast*`, `ThemeContext`, `utils/dateUtils`, `geoUtils` | dayjs con zona corporativa. |
| **GEOTrack** | `app.json` | Permisos de ubicación, segundo plano y FGS con textos en español, adaptados a "Dual Tracker" y al alcance "solo con jornada abierta". |
| **LEDTracker** (fuente anterior) | `runtime/ForegroundWorkService` | `startLocationUpdatesAsync` con `foregroundService` (notificación persistente Android). |
| **LEDTracker** (fuente anterior) | `SiteRegistryService` (geocoder vía `GeofenceRuntimeService.geocodeAddress`) | `Location.geocodeAsync` para convertir una dirección en coordenadas objetivo. |
| **LEDTracker** (fuente anterior) | `GeofenceRuntimeService.observeSample` | Detección de salida por "strikes" (3 muestras fuera) como respaldo de la región. |
| **GEOTrack / LEDTracker** (fuentes anteriores) | `components/modals/*` | Los seis modales parten de GEOTrack. DailySetupModal combina además el alta rápida del proyecto fuente anterior LEDTracker. ExitDetectionModal pasa de dos acciones a cuatro (§5.7). LunchModal suma el modo supervisor. |
| **W Tracker** | `modals/EditSessionModal`, `domain/sessionMachine` | Reglas `hasTimeChanged` / `requiresAuditNote`: la nota es obligatoria si cambian las horas. |
| **W Tracker** | tabs Hoy/Historial/Reportes/Ajustes, `session/[id]` | La estructura de pantallas se tomó como base del rediseño (REDISEÑO en Producto §2). Los simuladores y los datos mock no se portaron. |

Servicios **nuevos** sin equivalente en los dumps, escritos según la Técnica §5: TimeAuthority, PayrollEngine (políticas `CA_DAILY8_WEEKLY40_V1` y `LEGACY_DAILY8_V1`), IntegrityLedger + HashChain, TraceRecorder, SiteRegistry, TransitPolicy, PermissionsHealth, EvidencePack, DualDisclosure, ConcurrencyGuard, OfflineQueue y FieldCrypto.

---

## Atajos de demo: qué se hizo con ellos

Ninguno se arrastra en silencio. `src/constants/flags.ts` define `DEMO_MODE = false`, y **no existe ningún atajo activable**:

| Atajo en los dumps | Decisión |
|---|---|
| `validatePIN(pin) === "1234"` (W Tracker, `securityEngine.ts`) y hash fijo `SHA-256("1234")` (GEOTrack) | **Reemplazado**, como exigen la Técnica §4.8 y §10 y el Producto §4. `SecurityService` guarda un hash scrypt con sal aleatoria por PIN en SecureStore. Un hash SHA-256 iterado que ya estuviera guardado se acepta y, si el PIN coincide, se reescribe a scrypt. El PIN tiene mínimo 6 caracteres; hay bloqueo escalonado, TTL de desbloqueo y fail-secure. Lo configura el propio usuario la primera vez, o el empleador con un código de un solo uso. |
| Regla demo "`00:00` = solape" (W Tracker) | **Reemplazada** por un solape real: `PersistenceService.checkOverlap`, usado por `EditSessionModal` y `SessionEngine`. |
| Simuladores de corrupción, "forzar fallo de memoria", "Simular SO", GPS como toggle | **No existen** (Producto §4 y §5.14). Ajustes lee el estado real de `PermissionsHealthService`. |
| Empleador en duro ("LEON'S ELECTRICAL DESIGN") | Se toma de `CompanyPolicy.employerName`, que se edita en la zona admin. |

---

## Desviaciones e interpretaciones de las propuestas

- **Estructura y contratos**
  - Servicios en subcarpetas por capa (`src/services/{domain,evidence,runtime,persistence,application}`). La Técnica §6 solo pide que existan "en src/services" y §3 pide que cada uno se declare en una sola capa. Los nombres de los 23 servicios son exactamente los del catálogo.
  - Contratos en `src/core/contracts`. Siguen los campos mínimos de la Técnica §9.
  - Añadidos compatibles:
    - `SpatialFact.type` suma `PROVIDER_LOSS`.
    - `LedgerEntry` suma `payloadJson` e `integrityClass`.
    - `PayrollStatement` suma desgloses (`overtimeDailyHours`, `sessionIds`, `warnings`…).
  - Dos vocabularios de intención, `SessionIntent` (dominio) y `ViewIntent` (vista), unidos por la tabla `VIEW_TO_SESSION_INTENT`.
  - `app/` no importa servicios. Para que `_layout.tsx` "registre TaskOrchestrator" (Producto §3.1) se expone `registerBackgroundTasks()` en `src/core/boot.ts`.
  - Sin alias de rutas en tsconfig: las propuestas no los definen, así que se usan imports relativos.
- **Reglas de jornada**
  - `CANCEL_DAY` produce una sesión CERRADA marcada `cancelled`, que no computa en nómina.
  - Un traslado cancelado no es trabajo en el sitio de origen. Al cancelar, el tramo nuevo se congela `paid: true`, `rateMultiplier: 1` y `countsTowardOvertime: false` (`sessionMachine`). `PayrollEngineService` lo publica en `cancelledTransits` y el comprobante lo pinta como «Tránsito (cancelado)» (`src/services/evidence/reportPremium.ts`, clave `comprobante.lineTransitCancelled`), con la hora de cancelación y la nota si la hay (`transitCancel`). Esos minutos van a 1× y no cuentan para extra. El rato posterior sigue la jornada en el sitio. Un cancelado legado (`paid !== true`) conserva el camino de `TransitPolicyService`: no genera línea de tránsito y ese tiempo sigue contando como trabajo en el sitio. No se reescriben tramos ya cerrados.
  - Un ENTER no fiable (precisión mayor que el radio) pide confirmar la llegada a mano.
  - Orden de severidad al degradar: CONFLICT > MANUAL > AUTO > VALID.
  - El tránsito consume la capacidad regular diaria.
  - Política por defecto `CA_DAILY8_WEEKLY40_V1`. La política heredada se conserva.
  - El almuerzo no tiene 60 min por defecto: si no se declara, la nómina lo marca `LUNCH_DURATION_UNKNOWN`.
  - Solo se pueden eliminar sesiones CERRADAS, y el borrado es lógico.
  - La tarifa horaria se fija en el alta; después solo se edita en la zona admin (`SAVE_SETTINGS` la rechaza con `ADMIN_LOCKED` si el PIN no está abierto). Al iniciar la jornada se congela en `bookkeeping.hourlyRateSnapshot` (schema v8, columna `sessions.hourly_rate_snapshot`, PR #29). Un cambio posterior deja `HOURLY_RATE_CHANGED` y no reescribe las jornadas ya iniciadas. Una jornada anterior al campo, sin snapshot, usa la tarifa actual y el statement lo marca `RATE_FALLBACK_CURRENT`. Una tarifa 0 en el cálculo añade `HOURLY_RATE_ZERO`. En el alta y en Ajustes, un campo vacío no se guarda como 0, y el alta no acepta $0 (`rateInvalid`).
- **Hoy**
  - En PAUSADA, "Finalizar jornada" abre `LunchModal` en modo supervisor (tabla §5.7).
  - En TRASLADO, "Ver estado" abre el detalle de la sesión en curso.
  - La tab bar se oculta mientras la sesión está en SALIDA.
- **Historial**: el filtro "Todo" muestra el historial completo; los demás filtros se acotan a la semana seleccionada.
- **Conflicto**
  - El hecho A son los tiempos originales capturados antes del ajuste; el hecho B, los vigentes.
  - La diferencia y el impacto en nómina los calcula un selector con `PayrollEngineService`.
  - El back queda bloqueado (`beforeRemove`) mientras haya conflictos abiertos.
- **Rastro**: lista de puntos y, encima, un plano local dibujado en el teléfono (sin teselas ni clave de mapas). Ver `docs/TANDA2.md`.
- **Evidencia**
  - Los puntos de miga de pan no se escriben en el ledger (se resumen en el pack). El resto de hechos espaciales sí.
  - OS_KILL se detecta con un hueco de heartbeat de más de 45 min y solo deja asiento en el ledger.
  - La exportación automática nunca sella un periodo con CONFLICT.
- **Runtime**
  - Se eliminó el `delay()` bloqueante de "dwell" de la tarea de geocerca de GEOTrack. Lo sustituyen el debounce persistido y los strikes.
  - El recordatorio diario ya no cancela todas las notificaciones: cancela por id.

### Especificación FieldCryptoService v1.3 — prerrequisitos de nómina (§5, P1–P6)

- **P1 Calendario laboral**: hora de inicio de jornada y día de inicio de semana configurables (por defecto 00:00 y lunes). El cambio entra en vigor al final de la semana en curso, deja el asiento `CALENDAR_CHANGED` y se rechaza si un expediente sellado termina después de esa fecha. Entre la semana antigua y la nueva puede quedar un periodo de transición corto (`T…`). La ventana de `payrollExport.task` sale del calendario.
- **P2 Política v2** (`CA_DAILY8_WEEKLY40_v2`): parte cada sesión en el límite de jornada. La migración deja el asiento `PAYROLL_POLICY_CHANGED`. Los periodos ya sellados conservan su política (`policyForPeriod`).
- **P3 Pausas**: se guardan en `pauses_json` y se reparten por segmento. Hay un backfill único desde el ledger y, si no cuadra, se prorratea con la advertencia `PAUSE_PRORATED`. Solo se pregunta la hora de inicio del almuerzo cuando la sesión cruza el límite de jornada.
- **P4 `RESOLVE_SPLIT`**: divide una jornada cerrada en dos (A conserva el id y B es nueva). Pausas, almuerzo, tránsito y hechos espaciales pasan a la mitad que les corresponde, y se escriben 2 asientos.
- **P5 Ruptura del ledger**: el incidente se guarda de forma persistente. El administrador lo reconoce con PIN (`LEDGER_BREAK_ACKNOWLEDGED`), la verificación pasa a hacerse por segmentos y los periodos tocados solo se pueden sellar como no certificados. El informe es exportable.
- **P6 Reglas CA opcionales**:
  - Qué cubren: doble tiempo por encima de 12 h por jornada y la regla del séptimo día consecutivo (las primeras 8 h como OT y el exceso como doble tiempo).
  - Dónde se definen: los umbrales están declarados en la política v2.
  - Cuándo se aplican: **NO se aplican por defecto**. Solo entran si la empresa activa `payrollLegalFlags.caDoubleTime` o `caSeventhDay` (Ajustes → Calendario laboral). Cuando lo hace, el statement incluye `appliedRules`.
- **Banderas legales** (`payrollLegalFlags`, todas marcadas **CONFIRMAR CON ASESORÍA LEGAL** en la spec):

  | Bandera | Valor por defecto | Alternativa |
  | --- | --- | --- |
  | `transitionWeeklyThreshold` | `FULL` (40 h) | `PRORATED` |
  | `caDoubleTime` | `false` | — |
  | `caSeventhDay` | `false` | — |

### Especificación FieldCryptoService v1.3 — cifrado de campos (§6–§16, C1–C7)

- **Algoritmo y sobre**: AES-256-GCM (`@noble/ciphers`), IV aleatorio de 12 bytes. Sobre `enc:v1:{kid}:{fieldId}:{iv}:{ct}` en base64url. AAD = `dt-fc|v1|{kid}|{fieldId}|{rowId}` con versión explícita, así un sobre no se puede mover a otro campo ni a otra fila. Los valores degradados se guardan como `plain:v1:…`; el texto legado sin prefijo se sigue leyendo.
- **Clave maestra**: 32 bytes en SecureStore (`dt.mk.{kid}`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, sin biometría), para que las tareas en segundo plano funcionen con la pantalla bloqueada tras el primer desbloqueo. El alias antiguo migra a `dt.mk.k1` con los mismos bytes. `crypto.kids` (app_kv) guarda los kids conocidos.
- **Inventario cifrado**:
  - `sessions.manual_note_sealed`.
  - `sites.alias`, `client_name`, `address`, `notes` y `target_coords_enc`. Las columnas REAL `target_lat`/`target_lon` quedan en NULL.
  - `spatial_facts.coords_sealed`.
  - `app_kv` `settings.company` (companyEmail) y `runtime.last_fix`.
  - `listSites` ordena en memoria con `Intl.Collator("es")` y desempata por id; el SQL ya no hace `ORDER BY alias`.
  - Quedan en claro el nombre del empleado y la tarifa (§22 #9).
- **Arranque** (§11):
  1. `PersistenceService.init`.
  2. `ensureMasterKey`.
  3. Detección de pérdida de clave.
  4. `runCryptoDataMigrations`: REAL → `target_coords_enc` con verificación y ROLLBACK por fila.
  5. Barrido de hasta 500 filas `plain:v1:`/legado → `enc:v1:` (lo continúa `integritySweep`).
  6. Migración de política y verificación del ledger.
  7. `wirePorts` → `StoreActions.cryptoHealth` → hidratación.
- **Estados**:

  | Estado | Significado |
  | --- | --- |
  | `READY` | Clave activa disponible. |
  | `NEEDS_MIGRATE` | Alguna fila del paso de datos no verificó; se sigue cifrando con normalidad. |
  | `KEY_MISSING` | Hay sobres de un kid sin slot legible (restauración sin clave). |
  | `UNAVAILABLE` | Sin llavero: las escrituras se degradan a `plain:v1:`. |
  | `UNINITIALIZED` | Todavía no se ha intentado leer la clave. |

- **Sin cifrado** (§12): **no es CONFLICT**.
  - Cuándo aparece el bloqueo `FIELD_CRYPTO_UNAVAILABLE` (en `cert_blockers_json` y asiento `CERT_BLOCKER_ADDED`): solo si se escribió de verdad una nota o unas coordenadas en modo degradado. Es permanente, aunque la clave vuelva.
  - Qué provoca: el periodo solo puede sellarse como no certificado (`PERIOD_NOT_CERTIFIABLE`, `rollup.blockedCount`) y el badge muestra "No certificable".
  - Qué se rechaza: las 5 intenciones que escriben nota sobre una sesión cerrada.
  - Web: no admite jornadas certificadas y lo avisa con la microcopy de la spec.
- **Ledger v2** (§13): los asientos nuevos llevan `ledgerPayloadVersion: 2` y `noteDigest` = HMAC-SHA256 con una clave derivada por HKDF de la MK (info `dt.noteDigest.v1`). Nunca llevan la nota.
  - **Riesgo residual**: los asientos v1 ya escritos pueden contener notas en claro. No se reescriben porque el ledger es append-only (§20).
- **Pérdida de clave** (§14):
  - Kid nuevo: se crea el siguiente (máximo + 1) como activo y el slot perdido nunca se escribe.
  - Lectura: los sobres perdidos se hidratan como `null` + `unreadableFields`. La UI muestra "— (ilegible en este dispositivo)", "Rastro ilegible…" o "Datos del destino ilegibles…".
  - Integridad: las sesiones cerradas conservan su clase y su certificación. La jornada abierta afectada recibe `INTEGRITY_DEGRADE` con `FIELD_CRYPTO_KEY_LOST`.
  - Expedientes: los packs nuevos llevan `sealWarnings`.
- **Respaldos** (§16):
  - Registro: compartir un expediente deja el asiento `PACK_SHARED { packId, target }` y actualiza `Store.packs.sharedIds`.
  - Selector: `selectBackupAdvice` devuelve los packs sin compartir y el periodo cerrado más reciente sin pack.
  - Interfaz: tarjeta en Reportes y en el detalle del pack, y fila "Copia de expedientes" en Salud.
  - Acción: "Exportar expediente" lanza `EXPORT_PACK`, que sella el periodo si falta y luego lo comparte.
- **Fuera de alcance** (§20): SQLCipher, cifrado de los PDFs (van **sin cifrar**), rotación voluntaria de claves y recuperación tras perder la clave.
- **Logs**: `LoggingService` redacta las claves sensibles (`note`, `alias`, `lat`/`lon`, `companyEmail`…) y un test estático impide pasarlas.

### Bugs de los dumps corregidos al portar (GEOTrack)

- El borrado marcaba la sesión como CLOSED en lugar de borrado lógico.
- `checkOverlap` ignoraba las sesiones cerradas.
- Editar no actualizaba `actual_start`.
- Quedaban marcadores de conflicto de merge sin resolver.
- El failsafe usaba un radio fijo de 200 m y coordenadas `|| 0`.

### Bugs encontrados por la suite Jest

- Con el reloj manipulado (deriva > 3 min) o sin ubicación en segundo plano, solo `START_DAY` aplicaba la degradación: una jornada ya abierta podía cerrarse VALID. Ahora cualquier transición de una jornada abierta con entorno degradado la escala a CONFLICT (`sessionMachine`, helper `ok()`).
- `START_DAY` sin aviso dual aceptado llegaba al motor (que lo rechazaba). La propuesta pide que no se despache: el caso de uso `startDay` corta antes con `DISCLOSURE_NOT_ACCEPTED`; la máquina conserva su rechazo como defensa en profundidad.

---

## Hecho en la tanda 1 de confiabilidad

Detalle y checklist de teléfono: `docs/CONFIABILIDAD_TANDA1.md`.

- Jornada huérfana: hueco de heartbeat sin fix dentro del sitio → Revisar (`ORPHAN_SESSION`). No se cierra sola ni se inventan horas.
- Sensores que bloquean VALIDADA: ubicación, servicio en primer plano y reloj. El resto solo avisa (`src/core/healthPolicy.ts`).
- Hora de red: dos cabeceras HTTPS `Date` con acuerdo. Sin red no bloquea. También en geocerca, miga y vigilante.
- Firma Ed25519 del manifiesto v4. Los packs anteriores siguen válidos como `unsigned-v1`.
- Retención: se expurga solo si el periodo está exportado y pasaron los días mínimos. Las dos condiciones.
- Traducción inglesa: completa (`en.ts` tiene la misma forma que `es.ts`; la paridad la vigila Jest).

## Hecho en la tanda 2

Checklist de teléfono: `docs/TANDA2.md`.

- PIN de administración del empleador: código de un solo uso (`DTPIN1`), caduca, no se repite, asiento `ADMIN_PIN_PROVISIONED`. La primera clave Ed25519 del empleador no se fija a ciegas: hace falta la huella que el empleador dio por otro canal, o la clave anclada en el build. Otra clave se rechaza hasta desbloquear la zona admin (`EMPLOYER_KEY_PINNED` / `EMPLOYER_KEY_REPINNED`). El hash es scrypt; uno legado se reescribe al acertar. Hasta el primer código, el usuario lo fija y Ajustes dice «PIN local (no aprovisionado por empleador)». Generador sin servidor, con archivo de clave: `docs/PIN_APROVISIONAMIENTO.md`.
- Portal del empleador: POST HTTPS del expediente firmado, clave de idempotencia = `packHash`, reintentos con espera exponencial. Apagado y sin URL por defecto. Ajustes dice «Portal del empleador: no configurado». Contrato: `docs/PORTAL_EMPLEADOR.md`.
- Reportes: semana actual, semana anterior, quincena, mes o fechas. El rango se parte en semanas laborales y cada una usa el motor de siempre. El sello sigue siendo de una semana.
- Rastro: plano local con `react-native-svg` (miga, geocercas, entradas, salidas, traslados, norte y escala). No hay teselas ni se envían coordenadas. Un tramo expurgado se ve como hueco.
- Cifras provisionales en un solo módulo: `src/config/provisional.ts` y `docs/VALORES_PROVISIONALES.md`.

## Hecho en Soporte

Detalle: `docs/SOPORTE.md`. Entra con el PR #7 y el texto vigente es `soporte.v6` (`src/support/contentVersion.ts`).

- Vive en Ajustes y en `app/support`: índice, guía por pantalla (`guide/[id]`) y modo práctica (`practice`).
- Los textos están en `src/i18n/supportEs.ts` y `src/i18n/supportEn.ts`. El inglés tiene la misma forma que el español.
- El modo práctica (`src/support/practice.ts`, ruta `/support/practice`) es un reductor en memoria. No escribe SQLite, el libro, los expedientes ni la geocerca. La marca de agua es «PRÁCTICA».
- El diagnóstico para compartir (`src/support/diagnostic.ts`) va en lista blanca: sin coordenadas, nombre, tarifa, correo ni sobres `enc:v1`.

## Hecho en los comprobantes premium

Detalle: `docs/UI_PREMIUM.md` (PR #14) y `docs/COMPROBANTES_PREMIUM.md` (PR #15). La plantilla vigente es la v3 (`DOCUMENT_VERSION` en `src/core/contracts/evidence.ts`).

- El restyle de presentación (ritmo de 8 px) no cambia la nómina, el libro ni los hashes. La interfaz vigente usa Inter y los tokens de Dual Tracker V1.0.0 en `src/constants/theme.ts`.
- Un sello nuevo pinta el comprobante premium. `documentVersion`, `documentTheme` y `documentLocale` quedan fuera de `packHash` y de `contentHash`. Un expediente ya sellado no se reescribe.
- La v2 es el papel premium: tema claro por defecto, idioma del perfil al sellar, QR del `packHash` (sin URL ni red), firma y anexos.
- La v3 es ese mismo papel más el anexo de tramos de tránsito y la identidad del build en el pie.
- `scripts/sample-comprobantes.ts` escribe muestras locales. No son expedientes sellados.

## Hecho en las pruebas de campo 1 a 4

Listas: `docs/PRUEBA_CAMPO_1.md` (PR #16), `docs/PRUEBA_CAMPO_2.md` (PR #17), `docs/PRUEBA_CAMPO_3.md` (PR #19) y `docs/PRUEBA_CAMPO_4.md` (PR #22). El rechazo de horas que todavía no han pasado es el PR #18 (`src/services/domain/sessionTimeGuard.ts`).

- Una deriva de reloj ruidosa, con ubicación buena, avisa y no quita VALIDADA. El ENTER repetido y la salida en la banda de histéresis dejan de fichar de más. El sello «SELLADO» del PDF no se parte.
- Seguir tras un corte deja la clase MANUAL. El servicio de ubicación sigue durante el almuerzo y no guarda migas en `PAUSADA`. Una regla sale en `appliedRules` solo si produjo minutos. En sitio, la miga la manda el reloj.
- El almuerzo fijo no puede pasar de la jornada (se topa al calcular y se rechaza al guardar). Cada fila redondea sus propios minutos.
- La llegada no cierra con un reloj de GPS adelantado. Los minutos por sitio salen de la jornada (`src/services/domain/siteMinutes.ts`), no de las migas de la geocerca. El traslado cancelado nuevo se paga como tránsito hasta la cancelación (ver reglas de jornada). El manifiesto de un sello nuevo es v5.

## Hecho en la auditoría del 2026-10-20

Detalle: `docs/AUDITORIA_2026-10-20.md`. PR #20. La regresión queda en `src/services/domain/__tests__/auditFixes.2026-10-20.test.ts`.

- A1. Un sello no reutiliza el pack si el libro está roto.
- A2. Un v4 sin firma y sin `PACK_UNSIGNED` no verifica. La clave que se compara es la del llavero de firma del pack.
- A3. La verificación incremental relee el prefijo hasta el ancla.
- A4. El cierre automático no guarda un fin que todavía no ha llegado.
- A6. Una salida fiable en la banda de histéresis no se queda esperando.
- A7. El certificado que ve Reportes es el que usa el sello.
- A8. Una pausa no se etiqueta como almuerzo.
- A9 y A10. El tope del almuerzo fijo resta las pausas, también al prorratear.
- A5 sigue pendiente: al volver a primer plano se mide la deriva antes de reanclar. Es solo iOS y no se midió en un iPhone.

## Hecho en la auditoría 2

Detalle: `docs/AUDITORIA_2_2026-10-20.md`. PR #21. La regresión queda en `src/services/domain/__tests__/audit2Fixes.2026-10-20.test.ts`.

- El sello (asiento, pack y cola) va en una sola transacción. El candado solo suelta el lease de este runtime. Si el asiento del PIN no se escribe, SecureStore vuelve atrás y el código se puede repetir.
- `CompanyPolicy` rechaza rangos imposibles. Cada sesión guarda la zona en que se registró. Las horas extra siguen en California.
- Un estado desconocido se lee como `CUARENTENA` y queda fuera de la nómina. El barrido de cifrado no se da por terminado mientras quede `plain:v1:`. El correo solo cuenta como enviado con estado `sent`.
- `app/` entra en las raíces de Jest. Hay ocho flujos: fichar, cerrar, almuerzo, editar, sellar, ajustes, PIN y aviso de cuarentena.
- El hallazgo 17 (actualizaciones diferidas en iOS, sin el servicio en primer plano de Android) está en el código y no se ha validado en un iPhone.
- La base heredada de los proyectos fuente anteriores W Tracker, LEDTracker y GEOTrack no se migra: esas versiones no se publicaron. El producto vigente es Dual Tracker V1.0.0.

## Hecho en la auditoría 3

Detalle: `docs/AUDITORIA_3_2026-10-20.md`. PR #23. La regresión queda en `src/services/domain/__tests__/audit3Fixes.2026-10-20.test.ts`.

- La primera clave del PIN exige la huella tecleada o la clave anclada en el build (`src/config/employerKeyAnchor.ts`). Un rechazo de huella no gasta el nonce.
- `verify` sin ancla independiente no deja la identidad como verificada: `identity` queda `unverified` aunque la firma Ed25519 cuadre.
- Cada intento de sello escribe en un directorio pendiente. Si la transacción no llega a commit, ese directorio se borra.

## Hecho en la fase 1

Detalle: `docs/PRUEBA_CAMPO_5.md`. PR #24. La regresión queda en `src/services/runtime/__tests__/phase1Audit.2026-10-21.test.ts`. No cambia la nómina ni el hash de los asientos ya escritos.

- Ubicación simulada. `LocationObject.mocked` no ficha solo (`GeofenceRuntimeService`). Queda en el libro, en Salud y en el PDF (`mockedFacts`). El aviso sale una vez por jornada abierta (`src/services/runtime/mockLocationNotice.ts`). El registro a mano sigue permitido.
- Salto falso. La distancia que se juzga es la que no cabe en el error de los dos fixes (`effectiveJumpMeters` en `src/services/runtime/geofencePolicy.ts`). El intervalo usa la hora del fix y `clampSampleTimestamp` no la deja pasar de `TimeAuthority`. Dos lecturas a 60 m, separadas 1 s, con ±40 m de error, no son un salto.
- Relanzamiento. Si el servicio en primer plano se cae con la jornada abierta, el worker y el vigilante intentan arrancarlo (hasta 3 veces) y vuelven a registrar la geocerca (`src/services/runtime/monitoringRecovery.ts`). El libro anota `MONITORING_STOPPED_DETECTED`, `SERVICE_RECOVERY` y, si no pudo, `SERVICE_RECOVERY_FAILED`. Un hueco de 5 min o más es `MONITORING_GAP`. El umbral de jornada huérfana sigue en 45 min.

## Hecho en la fase 2

Detalle: `docs/PRUEBA_CAMPO_6.md`. PR #25. La regresión queda en `src/services/domain/__tests__/phase2Audit.2026-10-21.test.ts`. No cambia la nómina ni la clase de integridad por estas señales.

- Cada `MANUAL_PATCH` guarda el antes y el después de las horas (`sessionMachine`). Una segunda corrección trae como antes el después de la primera. La nota sigue como `noteDigest`, no en claro.
- Al cerrar se añade `SESSION_SEALED`. `sessionHash` es el SHA-256 de los hashes de los asientos de esa jornada, en orden, sin el propio sello (`src/services/evidence/sessionSeal.ts`). El PDF y el JSON lo muestran como id forense. Una jornada cerrada antes de esta versión no tiene ese asiento, y verificar un expediente viejo no lo exige.
- El expurgo de migas y el asiento `TRACE_PURGED` van en la misma transacción (`PersistenceService.deleteSpatialFactsByIds`). Fuera de ella el borrado está prohibido. Las entradas y salidas no se borran.
- Los cambios de permiso, GPS, avisos y batería dejan asiento solo cuando el estado cambia (`src/services/runtime/operationalHealthLedger.ts`). En Android 12+, la ubicación solo aproximada avisa en Salud y no baja el pago.

## Hecho en la fase 3

Detalle: `docs/PRUEBA_CAMPO_7.md`. PR #26. La regresión queda en `src/services/domain/__tests__/phase3Audit.2026-10-22.test.ts`. El puntaje y las anomalías no cambian el pago ni VALIDADA.

- Estado de monitoreo derivado (`src/core/monitoringState.ts`): Inactivo, Iniciando, Monitoreando, Degradado, Recuperando, Fallo. No es el estado de la jornada. Degradado aparece si no hay muestra en 5 minutos.
- Latido por componente en la tabla `service_health` (`src/services/runtime/serviceHealth.ts`, `src/services/persistence/schema.ts`): ubicación, geocerca, worker y vigilante. Es local y no entra en el expediente.
- El aviso persistente dice el destino, el GPS y el estado de monitoreo (`src/services/runtime/monitoringSnapshot.ts`).
- Anomalías con severidad LOW, MEDIUM, HIGH o CRITICAL (`src/services/runtime/anomalyCatalog.ts`). Se deduplican. El hecho original sigue en el rastro.
- Integridad del dispositivo: `modules/device-integrity` lee opciones de desarrollador y rutas de root (`su`, Magisk, busybox); `src/services/runtime/deviceIntegrity.ts` y `src/core/deviceIntegrityAssess.ts` arman la evidencia. Sin lectura no se afirma que el teléfono esté limpio. `modules/device-uptime` lee el reloj de arranque.
- Puntaje informativo 0–100 (`src/core/locationTrust.ts`): Excelente, Buena, Regular o Sospechosa. Sale en Salud, en el PDF y en `locationTrust` del expediente.

## Hecho en la fase 4

Detalle: `docs/PRUEBA_CAMPO_8.md`. PR #27. La regresión queda en `src/services/domain/__tests__/phase4Audit.2026-10-22.test.ts`. La cobertura y la reconstrucción son informativas.

- Cobertura de la jornada (`src/core/monitoringCoverage.ts`): porcentaje con monitoreo y minutos sin él. El hueco es la unión de `MONITORING_GAP`, de `GPS_LOST` hasta `GPS_RESTORED`, y del servicio parado hasta un `SERVICE_RECOVERY` con éxito. Entra en el expediente como `monitoringCoverage`.
- Auditoría de avisos críticos (`src/services/runtime/criticalNotices.ts`): llegada, salida, ubicación simulada, monitoreo detenido y recuperación fallida. `displayConfirmed` queda en false: Android no confirma que la notificación se haya pintado. `acceptedByOs` dice si el sistema aceptó programarla. Un toque del operario es `userAcknowledged`.
- Al sellar y al verificar, `sessionReplay` (`src/services/domain/sessionReplay.ts`) reconstruye los minutos desde el libro y los compara con la fila de `sessions`. Un desajuste es `SESSION_REPLAY`. Nadie reescribe el pago para cuadrarlo. Si un paso no se puede repetir, el resultado es `INCOMPLETE`.
- Si no hay `prev_hash` repetido, el arranque crea el índice único `idx_ledger_prev_hash` (`ensureUniquePrevHash` en `src/services/persistence/PersistenceService.ts`). Si ya había duplicados, no crea el índice, lo deja en el log y no reescribe asientos.
- Espera de llegada (`src/services/domain/arrivalDwell.ts`): 0 ms es el fichaje de siempre. El valor del sitio gana al de la empresa. El máximo es 30 minutos. Cuando la espera se cumple, la hora de llegada sigue siendo la primera lectura dentro del sitio.
- `BOOT_RESUME` (`src/services/runtime/bootResume.ts`): una vez por arranque, si el reloj de uptime dice que el teléfono se reinició después del último latido. Expo no ejecuta JavaScript en el instante de `BOOT_COMPLETED`. Sin ese reloj no se inventa un reinicio.

## Hecho en la robustez (PR #30)

No cambia el cálculo de nómina, la máquina de estados, los asientos, los hashes del libro, el manifiesto ni el sellado.

- `useBusyAction` (`src/core/hooks/useBusyAction.ts`): el mismo gate, `busy` y `try/finally` de Conflicto. Mientras corre, un segundo toque no dispara otra acción. Tras soltar, `BUSY_HOLD_MS` (800 ms) tampoco deja escribir otro asiento. Si `emit` lanza o devuelve `{ ok: false }` y nadie publicó un aviso, se avisa por `FeedbackService`. Un rechazo que el router ya avisó no se duplica.
- `ConfirmActionModal` pide confirmación antes de archivar un sitio, dividir un conflicto y cambiar un chip legal de nómina en Ajustes. El chip sigue guardando el mismo parche.
- El radio del sitio (`SiteRadiusField`, `src/utils/siteRadius.ts`) usa teclado numérico. NaN o un valor ≤ 0 muestra el error en línea y deja Guardar deshabilitado. La etiqueta ya dice «(m)».
- En el alta, una petición de permiso que termina en `unknown` marca el intento y no deja la tarjeta siguiente apagada (`src/utils/permissionChain.ts`). «Abrir ajustes» de ubicación usa `Linking.openSettings()` (permisos de la app). La batería sigue abriendo su ajuste.
- Reconocer una rotura del ledger solo vacía el campo del PIN si el reconocimiento sale bien (`app/system/health.tsx`).

## Hecho en los permisos de Android (PR #31)

Guía para el alta, reutilizada en Salud y en los problemas de Soporte (`PermissionGuidancePanel`, `src/utils/permissionGuidance.ts`). El alta no se bloquea. Ni la batería ni el resto de estos permisos cambian el pago. Nómina, máquina, libro, manifiesto y sello no se tocan.

- En Android, la tarjeta de batería abre `IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (`PermissionsHealthService`). Si la marca es Samsung, el texto añade el paso de One UI (apps en suspensión). Sin batería sin restricciones, la geocerca puede no registrar la llegada.
- Con solo ubicación en primer plano (Android 11+), la tarjeta explica que hay que elegir «Permitir todo el tiempo» / “Allow all the time” y lista los pasos.
- El botón de continuar cambia de etiqueta: «Continuar en modo limitado» si no hay nada concedido, «Continuar con permisos incompletos» si falta alguno, «Continuar» si están los tres. No se deshabilita.
- Notificaciones bloqueadas en Android 13+ (`POST_NOTIFICATIONS`): guía a Ajustes › Notificaciones.
- Las tarjetas ya concedidas se colapsan. La pendiente lleva el acento del tema y no se apaga con opacidad 0.5.

## Hecho en accesibilidad y textos (PR #32)

Etiquetas para TalkBack, textos y contraste del comprobante. No cambia la matemática de nómina, la máquina de estados, los asientos, los hashes, el manifiesto, el sello ni el QR.

- `NotFoundState` es el estado único de «no existe» (sesión, rastro, expediente, destino, periodo). El botón dice Volver / Back.
- Objetivos táctiles de la guía y de las tarjetas de permiso: `TOKENS.layout.minTouchTarget` es 48. Las etiquetas viven en `a11y.*` (`src/i18n/es.ts` y `en.ts`): cerrar, volver, PIN visible u oculto, llegada confirmada, permiso pendiente o concedido.
- El cronómetro y las duraciones se anuncian en horas y minutos (`src/i18n/labels.ts`, claves `a11y.hour` / `a11y.hours` / `a11y.minute` / `a11y.minutes`).
- El texto oro del comprobante claro es `PDF_LIGHT_TEXT_GOLD` (`#8A6D1F` en `reportPremium.ts`; el comentario del código lo deja en ≥ 4.5:1). El adorno sigue en `#C5A059`. Las etiquetas del PDF no bajan de 11 px. El QR, la firma y el hash no cambian de contenido.
- `StatusPill` acompaña el tono con un glifo (`PILL_GLYPH`): el estado no depende solo del color. Alto contraste (`profile.highContrast`) aclara texto y bordes y conserva el oro de la interfaz. No cambia la nómina.

## Hecho en el rediseño visual (PR #33)

Capa de presentación, sobre los tokens que ya existían (`ModalShell`, `OperationalHeroCard`). No hay un tema paralelo. Las marcas A «Pin-Reloj» y D «Llegada confirmada» se quedan. La paleta vigente es Dual Tracker V1.0.0 (`PALETTE_DARK` / `PALETTE_LIGHT` en `src/constants/theme.ts`): Inter 400/500/600; fondo `#0E0E0E`, tarjetas `#121212`, elevados y campos `#1E1E1E`, borde `#2A2A2A`; relleno primario `#F6C452` y texto sobre ese relleno `#1C1B19`; en claro el papel sigue `#F4F1EA`, la tinta `#1C1B19` y el texto dorado `#7A5D0A`. Estado (claro y oscuro): info `#4A90E2`, éxito `#5CD65C`, aviso `#F8C650`, peligro `#D9534F`, gris `#A8A9AB`. El selector claro de la app sigue oculto. La nómina, la máquina de estados, los hashes del libro, el manifiesto v5 y el sello no cambian.

- **Hoy.** `LiveShiftPanel`: hero con badge, cronómetro y estimado, y «Resumen del día» en el mismo reloj de 1 s. El resto de la pantalla sigue en 60 s. Sin estimado antes de la llegada. `GpsExceptionCard` cubre retraso de señal, asincronía, no show y abandono de zona (`gpsException.ts`). Cada caso es presentación de un estado que ya existía: no cierra la jornada ni cambia el pago. La salida detectada ofrece seguir en operación. El cierre muestra chips de almuerzo 0/30/45/60. Un tránsito cancelado se lee «tránsito (cancelado)».
- **Historial, Reportes, Ajustes y alta.** Historial filtra con chips y cada fila muestra el id (`history.sessionId` en `SessionListItem`). La vista previa de Reportes pasa `settings.profile.employeeName` a `DocumentPreviewWidget`. Ajustes valida tarifa y números en línea: Guardar no persiste `NaN`, y un campo de tarifa vacío no se guarda como 0. El pie usa `settingsFooterLine`: versión, build y, si la build lo trae, los 7 primeros caracteres del commit. La bienvenida lee `useTheme()` y deja Continuar en el `footer` de `ScreenScroll`.
- **Comprobante.** Sigue siendo el PDF claro por defecto (v3). El QR mide 96 px y el bloque de verificación no se parte. La firma va en un recuadro visible. Si no hay commit, el pie usa `versionsBuildNoCommit` («App {version} · build {code}») y no imprime una raya en su lugar. El anexo de entrada y salida incluye «Salida manual». Los minutos de almuerzo que se leen junto al reloj impreso no sustituyen `lunchMinutes` del motor.

## Límites conocidos

- **Android 12+ y el servicio en primer plano.** El sistema puede negar el arranque desde segundo plano (`ForegroundServiceStartNotAllowedException`), salvo exenciones; la que importa aquí es tener Dual Tracker fuera de la optimización de batería. La app lo anota como `SERVICE_RECOVERY_FAILED` y pide abrir Dual Tracker. No hay forma de forzarlo desde el worker. Android 14 exige además el tipo `location`. Ver `src/services/runtime/monitoringRecovery.ts`, `src/services/runtime/bootResume.ts` y `docs/PRUEBA_CAMPO_5.md`.
- **Sueño profundo y Force Stop en Samsung.** Con la app en suspensión profunda, o tras un Force Stop, el relanzamiento no ocurre hasta que alguien abre Dual Tracker. El worker de fondo no baja de 15 minutos y, con Doze, puede tardar horas. Volver a registrar la geocerca sí se puede intentar desde el fondo. Ver `docs/PRUEBA_CAMPO_5.md`.
- **Magisk oculto.** El root se lee por existencia de rutas (`su`, Magisk, busybox) en `modules/device-integrity`. Un Magisk oculto puede no salir. Una huella con «generic» puede marcar emulador sin serlo. Sin el binario de EAS, root y opciones de desarrollador quedan sin lectura y no se afirma que el teléfono esté limpio. Ver `docs/PRUEBA_CAMPO_7.md`.
- **Reconstrucción y política de tránsito.** `sessionReplay` vuelve a pasar los asientos por la máquina con la política vigente. Si la política de tránsito cambia después de congelar un tramo, la reconstrucción puede marcar desajuste (`SESSION_REPLAY`) aunque nadie haya tocado la fila. No se copian las banderas de pago guardadas: eso ocultaría el cambio. Ver `src/services/domain/sessionReplay.ts` y `docs/PRUEBA_CAMPO_8.md`.

## TODO (no especificado en las propuestas ni en el código previo)

Se marcan en el código como `TODO(propuesta)`:

- **Seguridad**
  - Cifrado de campos: implementado (spec FieldCrypto v1.3). Pendiente fuera de Jest: la matriz de dispositivo D1–D15 (`docs/PRUEBAS_DISPOSITIVO.md`).
- **Evidencia**
  - No hay revocación de packs en el modelo actual.
  - El orden relativo AUTO frente a otras severidades de integridad.
- **Plataforma** (post-1.0)
  - Cambio significativo de ubicación en iOS como respaldo de la geocerca.

## No aplica

- Migración de las bases de datos heredadas de los proyectos fuente anteriores (W Tracker, LEDTracker y GEOTrack) al esquema canónico de Dual Tracker V1.0.0. No aplica: esas versiones anteriores nunca se publicaron.

## Licencia

Software propietario. Todos los derechos reservados.

Copyright (c) 2026 Byron Efrain De Paz Garcia (GitHub: BDevDPaz).

El software, el código fuente, el diseño y la aplicación Dual Tracker son propietarios y confidenciales. No se concede permiso para usarlos, copiarlos, modificarlos, fusionarlos, publicarlos, distribuirlos, sublicenciarlos, venderlos ni explotarlos de otro modo, en todo o en parte, sin autorización previa por escrito del titular. El acceso a este repositorio no concede ninguna licencia.

El texto completo está en [LICENSE](LICENSE): primero en inglés y después en español. Si las dos versiones difieren, prevalece el inglés.

`package.json` declara `"private": true` y `"license": "UNLICENSED"`.
