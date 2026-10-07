# Dual Tracker

App Expo / React Native (TypeScript, **Expo SDK 54**, **expo-router 6**) que consolida los linajes **W Tracker**, **LEDTracker** y **GEOTrack (WTracker Trial_and_TraceT)** en un solo producto con dos garantías:

- **Tu tiempo**: horas, almuerzo, traslados y horas extra calculados con una política visible y versionada.
- **Tu rastro de jornada**: hechos espaciales (geocerca y, opcionalmente, miga de pan) registrados solo con la jornada abierta. Sirven de evidencia compartida entre empleado y empleador, con el mismo hash.

La estructura sigue las dos propuestas del proyecto, que son la fuente de verdad:

1. **PROPUESTA TÉCNICA – Arquitectura de servicios para Dual Tracker** (`DualTracker_ServiceLayer`), citada aquí como *Técnica §n*.
2. **PROPUESTA DE PRODUCTO – CAPA APP: Directorio app/ y blueprints de vistas**, citada aquí como *Producto §n*.

---

## Puesta en marcha

```bash
npm install
npx expo start          # abre el development build (expo-dev-client); Expo Go: --go, pero no sirve para geocerca/segundo plano
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint (incluye la regla de imports prohibidos en app/)
npx expo-doctor
```

> La geocerca, la ubicación en segundo plano, el servicio en primer plano y las tareas en segundo plano necesitan un **development build** (`npx expo run:android` / `npm run build:android:dev`). En Expo Go funcionan de forma limitada o no funcionan.

### Builds para equipos reales (EAS)

`eas.json` define cuatro perfiles: `development` (dev client), `preview` (build de release interno: APK en Android, ad hoc en iOS; es el que se usa para la matriz D1–D15; `autoIncrement`), `preview-d11` (variante aislada `com.bdevdpaz.dualtracker.d11` con el llavero forzado a fallar, solo para D11; también `autoIncrement`) y `production` (AAB / App Store, `autoIncrement`). Además, `preview-simulator` para el simulador de iOS (hereda `autoIncrement` de `preview`).

```bash
npm run build:android:preview   # APK para instalar a mano en el Android
npm run build:ios:preview       # ad hoc: requiere Apple Developer de pago y `eas device:create`
npm run build:android:d11       # solo D11 (se instala al lado como «Dual Tracker D11»)
npm run build:android:dev       # development build
```

Configuración única (`eas login`, `eas init`), instalación en Android y iPhone, variante D11 y su doble cerrojo: **[docs/BUILD.md](docs/BUILD.md)**. `app.config.ts` extiende `app.json` y solo cambia algo con `APP_VARIANT=d11`; sin esa variable la config es idéntica a `app.json`.

No hace falta `babel.config.js`: en SDK 54, `babel-preset-expo` se aplica por defecto e incluye el plugin de reanimated/worklets.

## Expediente: contentHash, idempotencia y verificación

- **Manifiesto v2** (`manifestVersion: 2`, `PACK_MANIFEST_VERSION`): añade `contentHash` = SHA-256 (expo-crypto, `canonicalJson`: claves ordenadas, sin `undefined`, fechas en epoch ms, no finitos → `null`) del contenido del periodo: el `PayrollStatement` sin `packHash` + la evidencia de sesiones (asientos con `sessionId`, trazas, conflictos). Excluye lo volátil de cada sello: `packId`, `sealedAtMs`, `ledgerHeadHash`, `ledgerChainValid` (estado global de la cadena) y los asientos sin sesión (`PAYROLL_SEALED` de sellos previos). `packHash` sigue siendo el hash del manifiesto completo y ahora incluye `manifestVersion` y `contentHash`; `statementHash` no cambia.
- **Manifiesto v3** (FieldCrypto v1.3 §15, `PACK_MANIFEST_VERSION = 3`): añade `sealWarnings: { code: "FIELD_CRYPTO_KEY_LOST"; sessionIds }[]` (vacío si no hay). Es contexto del dispositivo en el momento del sello: entra en `packHash` y **no** en `contentHash`, así que un resello tras perder la clave reutiliza el pack existente. `verify()` acepta v1, v2 y v3. El PDF y el detalle del pack muestran la advertencia.
- **Verificación** (`EvidencePackService.verify(pack)`): recomputa `statementHash`, `evidenceHash`, `contentHash` y `packHash` y comprueba que `statement.packHash` coincide. Devuelve `{ valid, legacy, failures[] }`.
- **Packs legados** (v1, sin `manifestVersion` ni `contentHash`): se verifican con el formato antiguo de `packHash` y sin comprobación de contenido (`legacy: true`). A un v2 no se le puede "degradar" a legado quitándole campos: su `packHash` deja de cuadrar. Un pack legado nunca se reutiliza.
- **Idempotencia**: sellar un periodo cuyo `contentHash` coincide con el del pack más reciente del mismo periodo devuelve ese pack (`reused: true`) sin `packId`, PDFs ni asiento nuevos; el router emite `PACK_REUSED` ("El expediente ya estaba sellado con este mismo contenido; se reutilizó."). No existe revocación de packs en el modelo actual, así que "no revocado" = cualquiera (TODO si se añade).
- **Reemisión explícita** (`reissue: true` en `EvidencePackService.seal` / `SEAL_PACK`): única forma de obtener dos packs distintos con contenido idéntico (PDF perdido, reenvío formal). Queda auditada en el ledger como `PACK_REISSUED` con `reissueOf`. Se prefirió a "sellar en otro contexto" porque es intencional, visible en el ledger y no depende de efectos colaterales.

## Pruebas (Jest)

Según la *Propuesta de integración de Jest*: se prueban las autoridades (dominio, evidencia, persistencia, runtime por contrato de handler), no el JSX de `app/`.

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
- `__tests__/` colocados por capa. Componentes: solo `IntegrityBadge`, `StatusPill`, `SessionTimeline`.
- Correspondencia de nombres de la propuesta: `california-daily-8-weekly-40` = `CA_DAILY8_WEEKLY40_v1`; `PersistenceService.updateStatus` (no existe) = cualquier `updateSession`/`insertSession` fuera de `SessionEngineService.dispatch`; `PATCH_SESSION` (vista) = `MANUAL_PATCH` (motor); `CERRADA`, `intentRouter`, `startDay`… existen con ese nombre.
- Ya no queda ningún `test.failing`: el de cifrado de campos pasa desde C2 (spec FieldCrypto v1.3 §17 #3).
- Estático (`src/core/__tests__/staticGuards.test.ts`): `FieldCryptoService` solo se importa desde `src/services/persistence/**` y `src/core/boot.ts`; `LoggingService` no recibe campos sensibles; Jest resuelve los subpaths `.js` de `@noble`.
- Matriz de dispositivo D1–D15 (spec §18): checklist en `docs/PRUEBAS_DISPOSITIVO.md`; builds para ejecutarla en `docs/BUILD.md`.
- Build (`src/core/__tests__/buildConfig.test.ts`): solo `preview-d11` fija `EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE` y siempre con `APP_VARIANT=d11`; `app.config.ts` rechaza la bandera en cualquier otra variante; `keyStore` solo la obedece en la variante d11.
- `scripts/check-dates.ts` se mantiene para el camino **sin Intl** en Hermes real; su equivalente Node vive en `src/utils/__tests__/dateUtils.test.ts`.
- Jest no sustituye la matriz de dispositivo: permisos reales, Foreground Service y geocerca en hardware siguen siendo prueba manual / Maestro.

---

## Estructura

```
dual-tracker/
├── app/                         ← Expo Router (raíz del proyecto, junto a src/) — 32 rutas (Producto §2)
│   ├── _layout.tsx              fuentes Montserrat, Theme/Toast, FeedbackBridge, boot(), registro de tareas
│   ├── index.tsx                gate: hidratación → onboarding → descargo → tabs
│   ├── +not-found.tsx  +html.tsx
│   ├── (boot)/                  _layout, hydrating
│   ├── (onboarding)/            _layout (progreso 4 pasos), welcome, disclosure, permissions, profile
│   ├── (tabs)/                  _layout, index (Hoy), history, reports, settings
│   ├── session/                 _layout, [id], [id]/trace
│   ├── sites/                   _layout, index, new, [id]
│   ├── report/                  _layout, [periodId], pack/[packId]
│   ├── system/                  _layout (modal), health, conflict
│   └── legal/                   _layout, disclosure, retention
├── src/
│   ├── core/
│   │   ├── contracts/           SessionRecord, SpatialFact, LedgerEntry, PayrollStatement, intents, estado… (Técnica §9)
│   │   ├── store/               store reactivo + acciones (portado de GEOTrack)
│   │   ├── selectors/           derivaciones puras para las vistas (getSessionStateUI, rollups, conflicto…)
│   │   ├── hooks/               useWorkTracker (ÚNICO gancho para rutas), useClock, useQuery
│   │   └── boot.ts              ensureRuntimeReady(), boot(), registerBackgroundTasks()
│   ├── services/                DualTracker_ServiceLayer — 23 servicios (Técnica §6), agrupados por capa (Técnica §3)
│   │   ├── domain/              SessionEngine, PayrollEngine (+payrollPolicies), IntegrityLedger, SiteRegistry,
│   │   │                        TransitPolicy, ConcurrencyGuard, DualDisclosure, sessionMachine
│   │   ├── evidence/            TimeAuthority, HashChain, TraceRecorder, Report (+reportTemplates), EvidencePack
│   │   ├── runtime/             GeofenceRuntime, TaskOrchestrator, ForegroundWork, PermissionsHealth,
│   │   │   └── tasks/           Notification, Security · geofence, breadcrumb, sessionWatchdog, exitDecisionTimer,
│   │   │                        dailyReminder, integritySweep, payrollExport (.task.ts)
│   │   ├── persistence/         Persistence (SQLite WAL, schema, mappers), Settings, Logging, OfflineQueue, FieldCrypto
│   │   ├── application/         Feedback, intentRouter (ViewIntent → servicio), useCases/ (startDay, confirmExit,
│   │   │                        generateWeeklyPayroll)
│   │   └── index.ts             catálogo canónico
│   ├── components/
│   │   ├── ui/                  design system (portado de GEOTrack): OperationalHeroCard, SystemHealthBlock,
│   │   │                        SessionTimeline, IntegrityBadge, StatusPill, ModalShell, PageHeader…
│   │   ├── modals/              DailySetupModal, ExitDetectionModal, LunchModal, EditSessionModal,
│   │   │                        DeleteSessionModal, AddNoteModal (Producto §7)
│   │   ├── blocks/              ScreenStatusBanner, PermissionCard, HealthRow, KeyValueRow, SessionListItem
│   │   ├── feedback/            FeedbackBridge (FeedbackService → toast / diálogo)
│   │   └── legal/               DisclosureContent (compartido por onboarding y legal/)
│   ├── i18n/                    es (base), en (parcial, cae a es), microcopy, legal (descargo/retención versionados)
│   ├── constants/               theme, icons, animations, geolocation, notifications, tasks, security, flags
│   ├── context/                 ThemeContext, ToastContext
│   └── utils/                   dateUtils (dayjs tz), geoUtils, canonicalJson, safeFileName, serializeError
├── assets/images/               icon, splash, adaptive-icon, favicon (MARCADORES de posición: sustituir)
├── docs/                        PRUEBAS_DISPOSITIVO.md (matriz D1–D15), BUILD.md (EAS Build)
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

Reglas que se cumplen en el código:

- **Una ruta es un caso de uso.** Las rutas no contienen reglas de nómina, geocerca ni persistencia. No importan `expo-sqlite`, `expo-location`, `expo-print` ni `src/services/*`. `eslint.config.js` lo impone con `no-restricted-imports` sobre `app/**`.
- **Toda mutación es una intención** (`ViewIntent`: START_DAY, CONFIRM_EXIT, PATCH_SESSION, SEAL_PACK…). `intentRouter` traduce las del ciclo de vida a `SessionIntent` mediante la tabla `VIEW_TO_SESSION_INTENT`. Las demás las atiende el servicio dueño.
- **Solo SessionEngine muta la jornada.** La geocerca, las notificaciones y la UI emiten hechos o intenciones.
- **Tiempo canónico.** Todo timestamp de nómina o auditoría sale de `TimeAuthorityService.now()`.
- **Evidencia antes que conveniencia.** Una edición manual guarda los tiempos originales (`bookkeeping.original`), pasa la sesión a MANUAL y deja asiento en el ledger encadenado por hash.
- **Estados de pantalla obligatorios** (`loading / empty / degraded / conflict / ready`). Se resuelven con `ScreenStatusBanner`.
- **Copy en i18n.** Las rutas no llevan strings legales en duro. El descargo y la retención los sirve `DualDisclosureService` (`src/i18n/legal.ts`, versión `2026-09-v1`).

---

## Qué se portó y desde qué app

| Origen | Portado a | Notas |
|---|---|---|
| **GEOTrack** | `src/components/ui/*`, `constants/theme`, `icons`, `animations` | Design system obsidian/oro. Se quitaron los nombres en duro ("GEOTrack Solutions Inc.", "W Tracker"). |
| **GEOTrack** | `core/store`, `core/selectors`, `core/hooks/useWorkTracker` | Suscripción reactiva real. `dispatch(DomainEvent)` pasa a ser `emit(ViewIntent)`. |
| **GEOTrack** | `domain/sessionMachine`, `SessionEngineService` | Transiciones de jornada, almuerzo, traslado, salida, auto-cierre de 12 h, anti-rebote. Estados en español (NO_INICIADA…CERRADA). |
| **GEOTrack** | `persistence/PersistenceService`, `schema`, `mappers` | SQLite WAL, migraciones, `checkOverlap`, borrado lógico. |
| **GEOTrack** | `runtime/GeofenceRuntimeService`, `tasks/geofence.task.ts` | Identificadores de región, validadores de precisión, debounce de salida pendiente en KV. |
| **GEOTrack** | `runtime/NotificationService`, `tasks/dailyReminder.task.ts` | Categoría de salida con acciones, recordatorio diario. |
| **GEOTrack** | `runtime/TaskOrchestratorService`, `sessionWatchdog`, `integritySweep` | Registro global de tareas, BackgroundTask, heartbeat. |
| **GEOTrack** | `evidence/ReportService`, `reportTemplates` | HTML → PDF con expo-print, compartir y email. Ahora a partir de un `PayrollStatement` sellado, con escape-html. |
| **GEOTrack** | `i18n`, `context/Toast*`, `ThemeContext`, `utils/dateUtils`, `geoUtils` | dayjs con zona corporativa. |
| **GEOTrack** | `app.json` | Permisos de ubicación, segundo plano y FGS con textos en español, adaptados a "Dual Tracker" y al alcance "solo con jornada abierta". |
| **LEDTracker** | `runtime/ForegroundWorkService` | `startLocationUpdatesAsync` con `foregroundService` (notificación persistente Android). |
| **LEDTracker** | `SiteRegistryService` (geocoder vía `GeofenceRuntimeService.geocodeAddress`) | `Location.geocodeAsync` para convertir una dirección en coordenadas objetivo. |
| **LEDTracker** | `GeofenceRuntimeService.observeSample` | Detección de salida por "strikes" (3 muestras fuera) como respaldo de la región. |
| **GEOTrack / LEDTracker** | `components/modals/*` | Los seis modales parten de GEOTrack. DailySetupModal combina además el alta rápida de LEDTracker. ExitDetectionModal pasa de dos acciones a cuatro (§5.7). LunchModal suma el modo supervisor. |
| **W Tracker** | `modals/EditSessionModal`, `domain/sessionMachine` | Reglas `hasTimeChanged` / `requiresAuditNote`: la nota es obligatoria si cambian las horas. |
| **W Tracker** | tabs Hoy/Historial/Reportes/Ajustes, `session/[id]` | La estructura de pantallas se tomó como base del rediseño (REDISEÑO en Producto §2). Los simuladores y los datos mock no se portaron. |

Servicios **nuevos** sin equivalente en los dumps, escritos según la Técnica §5: TimeAuthority, PayrollEngine (políticas `CA_DAILY8_WEEKLY40_V1` y `LEGACY_DAILY8_V1`), IntegrityLedger + HashChain, TraceRecorder, SiteRegistry, TransitPolicy, PermissionsHealth, EvidencePack, DualDisclosure, ConcurrencyGuard, OfflineQueue y FieldCrypto.

---

## Atajos de demo: qué se hizo con ellos

Ninguno se arrastra en silencio. `src/constants/flags.ts` define `DEMO_MODE = false`, y **no existe ningún atajo activable**:

| Atajo en los dumps | Decisión |
|---|---|
| `validatePIN(pin) === "1234"` (W Tracker, `securityEngine.ts`) y hash fijo `SHA-256("1234")` (GEOTrack) | **Reemplazado**, como exigen la Técnica §4.8 y §10 y el Producto §4. `SecurityService` guarda un hash SHA-256 iterado con sal en SecureStore. El PIN tiene mínimo 6 caracteres; hay bloqueo escalonado, TTL de desbloqueo y fail-secure. Lo configura el propio usuario la primera vez. |
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
  - Un traslado cancelado cuenta como tiempo de trabajo en el sitio de origen.
  - Un ENTER no fiable (precisión mayor que el radio) pide confirmar la llegada a mano.
  - Orden de severidad al degradar: CONFLICT > MANUAL > AUTO > VALID.
  - El tránsito consume la capacidad regular diaria.
  - Política por defecto `CA_DAILY8_WEEKLY40_V1`. La política heredada se conserva.
  - El almuerzo no tiene 60 min por defecto: si no se declara, la nómina lo marca `LUNCH_DURATION_UNKNOWN`.
  - Solo se pueden eliminar sesiones CERRADAS, y el borrado es lógico.
  - La tarifa horaria se fija en el alta; después solo se edita en la zona admin (`SAVE_SETTINGS` la rechaza con `ADMIN_LOCKED`).
- **Hoy**
  - En PAUSADA, "Finalizar jornada" abre `LunchModal` en modo supervisor (tabla §5.7).
  - En TRASLADO, "Ver estado" abre el detalle de la sesión en curso.
  - La tab bar se oculta mientras la sesión está en SALIDA.
- **Historial**: el filtro "Todo" muestra el historial completo; los demás filtros se acotan a la semana seleccionada.
- **Conflicto**
  - El hecho A son los tiempos originales capturados antes del ajuste; el hecho B, los vigentes.
  - La diferencia y el impacto en nómina los calcula un selector con `PayrollEngineService`.
  - El back queda bloqueado (`beforeRemove`) mientras haya conflictos abiertos.
- **Rastro**: se muestra como lista, porque no hay dependencia de mapas en los linajes.
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

## TODO (no especificado en las propuestas ni en el código previo)

Se marcan en el código como `TODO(propuesta)`:

- **Sesión y ledger**
  - Criterio de sesión huérfana o abandonada del watchdog.
- **Seguridad y cifrado**
  - Cifrado de campos: implementado (spec FieldCrypto v1.3). Pendiente fuera de Jest: la matriz de dispositivo D1–D15 (`docs/PRUEBAS_DISPOSITIVO.md`).
  - Aprovisionamiento del PIN admin por el empleador (hoy lo fija el primer usuario del dispositivo).
- **Evidencia y retención**
  - Firma del manifiesto JSON del pack (hoy va sin firmar, solo con hashes).
  - Retención "hasta fin de periodo exportado": solo se aplica la retención por días.

  - Destino remoto de `OfflineQueueService` (portal del empleador): la cola existe, el envío no.
- **Plataforma**
  - Migración de las bases de datos heredadas (W Tracker, LEDTracker y GEOTrack) al esquema canónico.
  - Deriva de reloj: solo se mide en primer plano (no hay fuente de hora de red definida).
  - Cambio significativo de ubicación en iOS como respaldo de la geocerca.
- **Vistas**
  - Qué sensores de `system/health` bloquean VALIDADA más allá de ubicación, FGS y reloj.
  - Selector de "rango" libre en Reportes (hoy: semana actual o anterior).
  - Vista de mapa en `session/[id]/trace`.
  - Traducción inglesa completa (`en.ts` es parcial).
- **Valores provisionales** (constantes en `src/constants/*`): perfiles de miga de pan, escalones de bloqueo del PIN, `destinationLimit = 20`, hueco de heartbeat de 45 min y ventana de decisión de salida.
- **Assets**: los PNG de `assets/images` son marcadores generados; hay que sustituirlos por la marca real.
