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
npx expo start          # Expo Go no sirve para geocerca/segundo plano: usar development build
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint (incluye la regla de imports prohibidos en app/)
npx expo-doctor
```

> La geocerca, la ubicación en segundo plano, el servicio en primer plano y las tareas en segundo plano necesitan un **development build** (`npx expo run:android` / `eas build --profile development`). En Expo Go funcionan de forma limitada o no funcionan.

No hace falta `babel.config.js`: en SDK 54, `babel-preset-expo` se aplica por defecto e incluye el plugin de reanimated/worklets.

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
├── app.json  package.json  tsconfig.json  eslint.config.js  expo-env.d.ts
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

### Bugs de los dumps corregidos al portar (GEOTrack)

- El borrado marcaba la sesión como CLOSED en lugar de borrado lógico.
- `checkOverlap` ignoraba las sesiones cerradas.
- Editar no actualizaba `actual_start`.
- Quedaban marcadores de conflicto de merge sin resolver.
- El failsafe usaba un radio fijo de 200 m y coordenadas `|| 0`.

---

## TODO (no especificado en las propuestas ni en el código previo)

Se marcan en el código como `TODO(propuesta)`:

- **Sesión y ledger**
  - `RESOLVE_SPLIT` (dividir sesión) responde `NOT_IMPLEMENTED`.
  - Edición de jornadas que cruzan medianoche.
  - Criterio de sesión huérfana o abandonada del watchdog.
  - Acción a tomar si `IntegrityLedger.verify()` detecta la cadena rota.
- **Seguridad y cifrado**
  - `FieldCryptoService` funciona en modo pass-through (`FIELD_CRYPTO_AVAILABLE = false`). Falta decidir el algoritmo y la gestión de claves.
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
