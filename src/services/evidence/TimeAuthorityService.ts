/**
 * TimeAuthorityService — Evidencia (Propuesta Técnica §5.1, nuevo, crítico)
 * ============================================================================
 * Autoridad única de reloj. Entrega now(), nowIso(), todayDateString() y
 * detecta deriva entre el reloj de pared del dispositivo, un reloj monótono y,
 * si hay red y se configuró una URL, una marca de tiempo de referencia.
 *
 * Regla: está prohibido `new Date()` / `Date.now()` / `dayjs()` disperso en
 * pantallas, tareas o servicios. Todo timestamp de nómina o auditoría pasa por
 * aquí. (El único `Date.now()` del proyecto vive en este archivo.)
 *
 * Origen: sustituye a src/utils/timeProvider.ts de GEOTrack.
 */
import { parseTimestamp, toDateString } from "../../utils/dateUtils";

/** Umbral de deriva (propuesta: "por ejemplo 3 minutos"). */
export const CLOCK_DRIFT_THRESHOLD_MS = 3 * 60 * 1000;

const monotonicNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

let wallAnchor = Date.now();
let monoAnchor = monotonicNow();
let lastReferenceOffsetMs: number | null = null;

/**
 * URL opcional para leer la cabecera HTTP `Date` como referencia.
 * TODO: la propuesta no define servidor de referencia; se deja desactivado.
 */
let referenceUrl: string | null = null;

export const TimeAuthorityService = {
  /** Timestamp canónico en ms. */
  now(): number {
    return Date.now();
  },

  /** ISO 8601 UTC. */
  nowIso(): string {
    return new Date(TimeAuthorityService.now()).toISOString();
  },

  /** YYYY-MM-DD del día actual en la zona corporativa (bookkeeping). */
  todayDateString(): string {
    return toDateString(TimeAuthorityService.now());
  },

  /** YYYY-MM-DD de un timestamp en la zona corporativa. */
  toDateString(ts: number): string {
    return toDateString(ts);
  },

  /**
   * Re-ancla el reloj monótono. Llamar al volver a primer plano: en iOS el
   * reloj monótono de JS no avanza con el dispositivo dormido, así que la
   * medición solo es válida dentro de una ventana en primer plano.
   * TODO(nativo): exponer elapsedRealtime (Android) / uptime con sueño (iOS)
   * para medir deriva también a través de suspensiones.
   */
  reanchor(): void {
    wallAnchor = Date.now();
    monoAnchor = monotonicNow();
  },

  /** Deriva local (ms, con signo): cuánto saltó el reloj de pared desde el ancla. */
  measureLocalDriftMs(): number {
    const wallElapsed = Date.now() - wallAnchor;
    const monoElapsed = monotonicNow() - monoAnchor;
    return wallElapsed - monoElapsed;
  },

  /** Deriva máxima conocida (local o contra referencia), valor absoluto. */
  currentDriftMs(): number {
    const local = Math.abs(TimeAuthorityService.measureLocalDriftMs());
    const ref = lastReferenceOffsetMs === null ? 0 : Math.abs(lastReferenceOffsetMs);
    return Math.max(local, ref);
  },

  /** true si la deriva supera el umbral → el evento se etiqueta CLOCK_DRIFT. */
  isDriftExceeded(): boolean {
    return TimeAuthorityService.currentDriftMs() > CLOCK_DRIFT_THRESHOLD_MS;
  },

  configureReference(url: string | null): void {
    referenceUrl = url;
  },

  /**
   * Compara el reloj del dispositivo contra la cabecera `Date` de una URL.
   * Devuelve el desfase en ms (dispositivo − referencia) o null si no hay red
   * o no hay URL configurada. Resolución de 1 s (cabecera HTTP).
   */
  async checkReferenceTime(): Promise<number | null> {
    if (!referenceUrl) return null;
    try {
      const before = Date.now();
      const res = await fetch(referenceUrl, { method: "HEAD" });
      const after = Date.now();
      const header = res.headers.get("date");
      if (!header) return null;
      // Hermes no garantiza Date.parse de RFC 1123: parser central.
      const refMs = parseTimestamp(header);
      if (refMs === null) return null;
      const deviceMid = before + (after - before) / 2;
      lastReferenceOffsetMs = deviceMid - refMs;
      return lastReferenceOffsetMs;
    } catch {
      return null;
    }
  },
};

export type TimeAuthority = typeof TimeAuthorityService;
