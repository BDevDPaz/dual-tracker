/**
 * Valores provisionales — única definición.
 * ============================================================================
 * Cada cifra que la propuesta dejó como ejemplo, o que la tanda 1 fijó a la
 * espera de confirmarla con el empleador, vive aquí. El resto del código lee
 * estas constantes; no las vuelve a escribir. La prueba
 * `src/config/__tests__/provisionalGuard.test.ts` falla si alguna se redefine.
 *
 * Tabla para personas: docs/VALORES_PROVISIONALES.md.
 */
export interface ProvisionalSpec<T> {
  readonly id: string;
  readonly value: T;
  readonly unit: string;
  readonly rationale: string;
  readonly source: string;
}

function spec<T>(id: string, value: T, unit: string, rationale: string, source: string): ProvisionalSpec<T> {
  return Object.freeze({ id, value, unit, rationale, source });
}

const pinAttemptDelayMs = spec(
  "pin.attemptDelayMs",
  650,
  "ms",
  "Retardo fijo antes de responder a un intento de PIN, para frenar la fuerza bruta.",
  "GEOTrack securityAdapter (650 ms). Técnica §4.8 pide retardo sin fijar la cifra.",
);

const pinHashIterations = spec(
  "pin.hashIterations",
  1000,
  "rondas",
  "SHA-256 iterado. Solo verifica un PIN guardado antes de scrypt. Si el PIN coincide, se reescribe con scrypt y esta cifra deja de usarse.",
  "Técnica §4.8. Se conserva para la migración transparente.",
);

const pinScryptN = spec(
  "pin.scryptN",
  16384,
  "factor N (potencia de 2)",
  "Coste de CPU y de memoria de scrypt. En este host son unos 50 ms y unos 16 MB. Un Android de gama media en JS puro suele ir 5–8 veces más lento, así que cae cerca de 250–500 ms. No bajar N: los PIN ya guardados se verifican con el N que llevan escrito.",
  "Tanda 2, endurecimiento. RFC 7914. Medido con @noble/hashes en el entorno de pruebas.",
);

const pinScryptR = spec(
  "pin.scryptR",
  8,
  "factor r",
  "Tamaño de bloque habitual de scrypt. Junto con N fija la memoria (128·N·r bytes).",
  "RFC 7914. Valor de uso común.",
);

const pinScryptP = spec(
  "pin.scryptP",
  1,
  "factor p",
  "Paralelismo. 1 basta: el teléfono deriva un solo PIN y no necesita varias hebras.",
  "RFC 7914. Valor de uso común para un inicio de sesión.",
);

const pinScryptDkLen = spec(
  "pin.scryptDkLen",
  32,
  "bytes",
  "Longitud de la clave derivada. 32 bytes para compararla en tiempo constante.",
  "RFC 7914. dkLen ≥ 1; 32 es el tamaño de una clave.",
);

const pinMinLength = spec(
  "pin.minLength",
  6,
  "caracteres",
  "Mínimo del PIN o clave de administración. Sustituye el demo de 4 dígitos.",
  "Técnica §4.8 y Producto §4.",
);

const pinLockoutSteps = spec(
  "pin.lockoutSteps",
  [
    [3, 30 * 1000],
    [5, 5 * 60 * 1000],
    [8, 30 * 60 * 1000],
    [10, 24 * 60 * 60 * 1000],
  ] as readonly (readonly [number, number])[],
  "intentos fallidos → ms de bloqueo",
  "Escalera progresiva. Cada par es el umbral de fallos acumulados y la duración del bloqueo.",
  "Técnica §4.8 (bloqueo progresivo, sin cifras). Se conservan los escalones ya usados por SecurityService.",
);

const adminUnlockTtlMs = spec(
  "pin.adminUnlockTtlMs",
  10 * 60 * 1000,
  "ms",
  "La zona admin desbloqueada caduca. No es un secreto persistente: es sesión de interfaz.",
  "Técnica §4.8 (estado de desbloqueo con caducidad).",
);

const pinProvisionDefaultTtlMs = spec(
  "pin.provisionDefaultTtlMs",
  72 * 60 * 60 * 1000,
  "ms",
  "Caducidad por defecto del código de un solo uso que genera el empleador, si el script no recibe --hours.",
  "Tanda 2. Decisión: el código expira; no hay servidor que lo revoque.",
);

const breadcrumbProfiles = spec(
  "breadcrumb.profiles",
  {
    ON_SITE: { timeIntervalMs: 5 * 60 * 1000, distanceIntervalM: 50 },
    IN_TRANSIT: { timeIntervalMs: 30 * 1000, distanceIntervalM: 25 },
    WAITING: { timeIntervalMs: 2 * 60 * 1000, distanceIntervalM: 100 },
  } as const,
  "ms y metros",
  "Muestreo adaptativo: más lento dentro del sitio, más frecuente en traslado, intermedio en espera o salida.",
  "Técnica §5.4 (intervalo largo dentro, más frecuente en tránsito, sin cifras). Ajustar tras pruebas de batería.",
);

const breadcrumbGapFactor = spec(
  "breadcrumb.gapFactor",
  2,
  "veces el intervalo en sitio",
  "Si dos migas consecutivas se separan más que este factor por el intervalo en sitio, el mapa no inventa el tramo: lo dibuja como hueco.",
  "Tanda 2. El expurgo de retención deja exactamente ese tipo de hueco.",
);

const destinationLimit = spec(
  "sites.destinationLimit",
  20,
  "destinos activos",
  "Tope de sitios activos por dispositivo. La propuesta nombra destinationLimit y no fija el número.",
  "Producto §5.5. SettingsService lo usaba como 20.",
);

const heartbeatGapMs = spec(
  "heartbeat.gapMs",
  45 * 60 * 1000,
  "ms",
  "Hueco de heartbeat que, sin una lectura dentro del sitio, marca la jornada como huérfana. Un heartbeat que nunca existió no cuenta.",
  "Tanda 1 (docs/CONFIABILIDAD_TANDA1.md). Antes estaba en src/constants/tasks.ts.",
);

const exitDebounceMs = spec(
  "exit.debounceMs",
  2 * 60 * 1000,
  "ms",
  "Debounce por defecto antes de tratar una salida como real. La empresa puede cambiarlo en la política.",
  "Técnica §4.3 («hoy ~2 min», configurable). Valor por defecto de CompanyPolicy.",
);

const exitDecisionWindowMs = spec(
  "exit.decisionWindowMs",
  15 * 60 * 1000,
  "ms",
  "Plazo para que la persona decida tras la primera salida (seguir, cerrar, trasladar). Al vencer, aplica la política de caducidad.",
  "GEOTrack BackgroundTasks FAILSAFE_THRESHOLD_MS (15 min). Técnica §7.2 no fija la cifra.",
);

const clockDriftThresholdMs = spec(
  "clock.driftThresholdMs",
  3 * 60 * 1000,
  "ms",
  "Por encima de esto la jornada abierta pasa a Revisar (CLOCK_DRIFT). Vale para el salto del reloj local y para la muestra de red.",
  "Técnica §5.1 («por ejemplo 3 minutos»). Tanda 1 lo dejó en 3 min.",
);

const timeSourceAgreementMs = spec(
  "clock.hostAgreementMs",
  5_000,
  "ms",
  "Las dos cabeceras Date tienen que coincidir dentro de este margen (incluye la ida y vuelta). Si no, no hay muestra de red y no se bloquea por ese camino.",
  "Tanda 1 (docs/CONFIABILIDAD_TANDA1.md): acuerdo de 5 s.",
);

const traceRetentionDays = spec(
  "retention.days",
  90,
  "días",
  "Mínimo de días tras el fin del periodo exportado antes de poder borrar la miga. Sin expediente, no se borra.",
  "Técnica §5.4 («por ejemplo 90 días»). Tanda 1 exige las dos condiciones.",
);

const reportMaxRangeMs = spec(
  "reports.maxRangeMs",
  366 * 24 * 60 * 60 * 1000,
  "ms",
  "El rango libre de Reportes no puede pasar de un año (366 días, para cubrir un bisiesto). El fin tiene que ser igual o posterior al inicio.",
  "Tanda 2. La propuesta pedía un selector de rango y no fijó el máximo.",
);

const portalBackoffBaseMs = spec(
  "portal.backoffBaseMs",
  30_000,
  "ms",
  "Primera espera tras un fallo de envío al portal. Cada fallo siguiente duplica la espera hasta el tope.",
  "Tanda 2. No hay cifra en la propuesta.",
);

const portalBackoffCapMs = spec(
  "portal.backoffCapMs",
  6 * 60 * 60 * 1000,
  "ms",
  "Tope de la espera entre reintentos. La cola sigue en el teléfono; no se descarta el expediente.",
  "Tanda 2.",
);

const portalMaxAttempts = spec(
  "portal.maxAttempts",
  8,
  "intentos",
  "Tras este número de fallos el ítem queda FAILED y no se reintenta solo. Un envío nuevo (otro sello) es otra fila.",
  "Tanda 2.",
);

const portalTimeoutMs = spec(
  "portal.timeoutMs",
  20_000,
  "ms",
  "Corte de la petición HTTPS. Un corte cuenta como fallo y entra en la espera exponencial.",
  "Tanda 2.",
);

/** Catálogo. La prueba de guardia recorre `id` y los nombres planos de abajo. */
export const PROVISIONAL = {
  pin: {
    attemptDelayMs: pinAttemptDelayMs,
    hashIterations: pinHashIterations,
    scryptN: pinScryptN,
    scryptR: pinScryptR,
    scryptP: pinScryptP,
    scryptDkLen: pinScryptDkLen,
    minLength: pinMinLength,
    lockoutSteps: pinLockoutSteps,
    adminUnlockTtlMs: adminUnlockTtlMs,
    provisionDefaultTtlMs: pinProvisionDefaultTtlMs,
  },
  breadcrumb: {
    profiles: breadcrumbProfiles,
    gapFactor: breadcrumbGapFactor,
  },
  sites: { destinationLimit },
  heartbeat: { gapMs: heartbeatGapMs },
  exit: { debounceMs: exitDebounceMs, decisionWindowMs: exitDecisionWindowMs },
  clock: { driftThresholdMs: clockDriftThresholdMs, hostAgreementMs: timeSourceAgreementMs },
  retention: { days: traceRetentionDays },
  reports: { maxRangeMs: reportMaxRangeMs },
  portal: {
    backoffBaseMs: portalBackoffBaseMs,
    backoffCapMs: portalBackoffCapMs,
    maxAttempts: portalMaxAttempts,
    timeoutMs: portalTimeoutMs,
  },
} as const;

export const PROVISIONAL_SPECS: readonly ProvisionalSpec<unknown>[] = [
  pinAttemptDelayMs,
  pinHashIterations,
  pinScryptN,
  pinScryptR,
  pinScryptP,
  pinScryptDkLen,
  pinMinLength,
  pinLockoutSteps,
  adminUnlockTtlMs,
  pinProvisionDefaultTtlMs,
  breadcrumbProfiles,
  breadcrumbGapFactor,
  destinationLimit,
  heartbeatGapMs,
  exitDebounceMs,
  exitDecisionWindowMs,
  clockDriftThresholdMs,
  timeSourceAgreementMs,
  traceRetentionDays,
  reportMaxRangeMs,
  portalBackoffBaseMs,
  portalBackoffCapMs,
  portalMaxAttempts,
  portalTimeoutMs,
];

/** Nombres planos. Definidos solo en este archivo. */
export const PIN_ATTEMPT_DELAY_MS = pinAttemptDelayMs.value;
export const PIN_HASH_ITERATIONS = pinHashIterations.value;
export const PIN_SCRYPT_N = pinScryptN.value;
export const PIN_SCRYPT_R = pinScryptR.value;
export const PIN_SCRYPT_P = pinScryptP.value;
export const PIN_SCRYPT_DK_LEN = pinScryptDkLen.value;
export const PIN_MIN_LENGTH = pinMinLength.value;
export const PIN_LOCKOUT_STEPS = pinLockoutSteps.value;
export const ADMIN_UNLOCK_TTL_MS = adminUnlockTtlMs.value;
export const PIN_PROVISION_DEFAULT_TTL_MS = pinProvisionDefaultTtlMs.value;
export const BREADCRUMB_PROFILES = breadcrumbProfiles.value;
export const BREADCRUMB_GAP_FACTOR = breadcrumbGapFactor.value;
export const DEFAULT_DESTINATION_LIMIT = destinationLimit.value;
export const HEARTBEAT_GAP_MS = heartbeatGapMs.value;
export const DEFAULT_EXIT_DEBOUNCE_MS = exitDebounceMs.value;
export const DEFAULT_EXIT_DECISION_WINDOW_MS = exitDecisionWindowMs.value;
export const CLOCK_DRIFT_THRESHOLD_MS = clockDriftThresholdMs.value;
export const TIME_SOURCE_AGREEMENT_MS = timeSourceAgreementMs.value;
export const DEFAULT_TRACE_RETENTION_DAYS = traceRetentionDays.value;
export const REPORT_MAX_RANGE_MS = reportMaxRangeMs.value;
export const PORTAL_BACKOFF_BASE_MS = portalBackoffBaseMs.value;
export const PORTAL_BACKOFF_CAP_MS = portalBackoffCapMs.value;
export const PORTAL_MAX_ATTEMPTS = portalMaxAttempts.value;
export const PORTAL_TIMEOUT_MS = portalTimeoutMs.value;

/**
 * Expresiones que solo pueden aparecer en este archivo (fuera de pruebas).
 * Si alguien copia la cifra a otro módulo, la guardia falla.
 */
export const PROVISIONAL_FINGERPRINTS = [
  "45 * 60 * 1000",
  "3 * 60 * 1000",
  "15 * 60 * 1000",
  "2 * 60 * 1000",
  "5 * 60 * 1000",
  "10 * 60 * 1000",
  "366 * 24 * 60 * 60 * 1000",
  "destinationLimit: 20",
  "traceRetentionDays: 90",
] as const;
