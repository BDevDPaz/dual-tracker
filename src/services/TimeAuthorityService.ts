import dayjs from "../utils/dayjsSetup";

/**
 * ============================================================================
 * TimeAuthorityService — Propuesta 5.1 (nuevo, crítico)
 * ----------------------------------------------------------------------------
 * Autoridad única de reloj para todo el dominio Dual Tracker. Ningún otro
 * servicio debe instanciar `new Date()` o `dayjs()` sueltos para producir un
 * timestamp de negocio: todos consultan `timeAuthorityService`.
 *
 * Detecta deriva de reloj comparando el avance del reloj de pared
 * (Date.now()) contra el avance de un reloj monotónico (performance.now())
 * entre dos llamadas. Si ambos relojes no avanzan de forma consistente más
 * allá de CLOCK_DRIFT_THRESHOLD_MS, el llamador debe marcar el evento como
 * CLOCK_DRIFT (ver IntegrityReasonCode en src/core/contracts/domain.ts) y la
 * integridad resultante no puede ser VALID.
 * ============================================================================
 */

/** Umbral de deriva de reloj: 3 minutos, según Propuesta 5.1. */
export const CLOCK_DRIFT_THRESHOLD_MS = 180000;

/** Resultado de una verificación de deriva de reloj. */
export interface ClockDriftResult {
  /** Diferencia en ms entre el avance de wall-clock y el avance monotónico. */
  driftMs: number;
  /** true si |driftMs| supera CLOCK_DRIFT_THRESHOLD_MS. */
  isDrifted: boolean;
}

/**
 * Resuelve un reloj monotónico disponible en el runtime actual (Hermes/V8,
 * Node en pruebas). `performance.now()` no está garantizado en todos los
 * entornos de test, por lo que se degrada a Date.now() como último recurso
 * (en ese caso la detección de deriva siempre reporta 0, lo cual es seguro:
 * nunca produce un falso positivo de deriva).
 */
function monotonicNowMs(): number {
  const perf: { now?: () => number } | undefined = (
    globalThis as unknown as { performance?: { now?: () => number } }
  ).performance;

  if (perf && typeof perf.now === "function") {
    return perf.now();
  }

  return Date.now();
}

class TimeAuthorityService {
  /** Ancla de wall-clock tomada la primera vez que se consulta el servicio. */
  private readonly anchorWallClockMs: number;
  /** Ancla monotónica tomada en el mismo instante que anchorWallClockMs. */
  private readonly anchorMonotonicMs: number;

  constructor() {
    this.anchorWallClockMs = Date.now();
    this.anchorMonotonicMs = monotonicNowMs();
  }

  /** Timestamp canónico actual en milisegundos (epoch UTC). */
  now(): number {
    return dayjs().valueOf();
  }

  /** Timestamp canónico actual en formato ISO 8601 (UTC). */
  nowIso(): string {
    return dayjs.utc().toISOString();
  }

  /** Fecha canónica del día actual en formato YYYY-MM-DD. */
  todayDateString(): string {
    return dayjs().format("YYYY-MM-DD");
  }

  /** Fecha en formato YYYY-MM-DD de un timestamp arbitrario. */
  toDateString(timestampMs: number): string {
    return dayjs(timestampMs).format("YYYY-MM-DD");
  }

  /** Timestamp arbitrario formateado como ISO 8601. */
  toIso(timestampMs: number): string {
    return dayjs(timestampMs).toISOString();
  }

  /**
   * Compara el avance del reloj de pared contra el reloj monotónico desde
   * la ancla del servicio (o desde `referenceMs` si se provee un wall-clock
   * de referencia externo, por ejemplo un timestamp de servidor/red).
   *
   * driftMs > 0 implica que el reloj de pared avanzó más que el monotónico
   * (el usuario adelantó el reloj o hubo un salto NTP hacia adelante).
   * driftMs < 0 implica lo contrario (reloj atrasado o suspensión del SO).
   */
  checkDrift(referenceMs?: number): ClockDriftResult {
    const wallClockElapsedMs = Date.now() - (referenceMs ?? this.anchorWallClockMs);
    const monotonicElapsedMs = monotonicNowMs() - this.anchorMonotonicMs;

    const driftMs = wallClockElapsedMs - monotonicElapsedMs;
    const isDrifted = Math.abs(driftMs) > CLOCK_DRIFT_THRESHOLD_MS;

    return { driftMs, isDrifted };
  }
}

/** Instancia única — importar esto, nunca instanciar la clase directamente. */
export const timeAuthorityService = new TimeAuthorityService();
