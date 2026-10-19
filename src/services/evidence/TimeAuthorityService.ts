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
 * Dos orígenes HTTPS conocidos. La deriva de red solo cuenta si los dos
 * responden y concuerdan (cabecera Date, resolución de 1 s). Sin red no se
 * bloquea VALIDADA por este camino.
 */
export const TRUSTED_TIME_HOSTS = ["https://www.google.com/generate_204", "https://www.cloudflare.com/cdn-cgi/trace"] as const;

/** Acuerdo máximo entre las dos fuentes (cabecera HTTP Date + ida y vuelta). */
export const TIME_SOURCE_AGREEMENT_MS = 5_000;

/** URL opcional de una sola fuente (pruebas y configuración manual). */
let referenceUrl: string | null = null;
let trustedHosts: readonly string[] = TRUSTED_TIME_HOSTS;
/** true solo tras una muestra de red que respondió. Offline no bloquea. */
let lastSampleOnline = false;

type HeaderResponse = { headers: { get(name: string): string | null } };
let fetchImpl: (url: string) => Promise<HeaderResponse> = async (url) => fetch(url, { method: "HEAD" });

export interface NetworkTimeSample {
  /** Desfase dispositivo − referencia, ms. null si no hubo acuerdo o no hubo red. */
  driftMs: number | null;
  agreed: boolean;
  offline: boolean;
  hosts: { host: string; driftMs: number | null }[];
}

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

  /** Deriva máxima que puede bloquear: local, o de red solo si la última muestra llegó. */
  currentDriftMs(): number {
    const local = Math.abs(TimeAuthorityService.measureLocalDriftMs());
    const ref = lastSampleOnline && lastReferenceOffsetMs !== null ? Math.abs(lastReferenceOffsetMs) : 0;
    return Math.max(local, ref);
  },

  /**
   * true si la deriva local, o la de red con la última muestra en línea,
   * supera el umbral. Estar sin red no marca deriva.
   */
  isDriftExceeded(): boolean {
    if (Math.abs(TimeAuthorityService.measureLocalDriftMs()) > CLOCK_DRIFT_THRESHOLD_MS) return true;
    return lastSampleOnline && lastReferenceOffsetMs !== null && Math.abs(lastReferenceOffsetMs) > CLOCK_DRIFT_THRESHOLD_MS;
  },

  /** Última muestra de red llegó (las dos fuentes concordaron, o la URL única respondió). */
  isNetworkSampleOnline(): boolean {
    return lastSampleOnline;
  },

  configureReference(url: string | null): void {
    referenceUrl = url;
  },

  /** Sustituye los dos hosts de confianza (pruebas). null restaura los de producción. */
  configureTrustedHosts(hosts: readonly string[] | null): void {
    trustedHosts = hosts && hosts.length >= 2 ? hosts : TRUSTED_TIME_HOSTS;
  },

  /**
   * Compara el reloj del dispositivo contra la cabecera `Date` de una URL.
   * Devuelve el desfase en ms (dispositivo − referencia) o null si no hay red
   * o no hay URL configurada. Resolución de 1 s (cabecera HTTP).
   * Un fallo deja la muestra fuera de línea: no bloquea por la red.
   */
  async checkReferenceTime(): Promise<number | null> {
    if (!referenceUrl) return null;
    const sample = await readHostDrift(referenceUrl);
    if (sample === null) {
      lastSampleOnline = false;
      return null;
    }
    lastSampleOnline = true;
    lastReferenceOffsetMs = sample;
    return sample;
  },

  /**
   * Dos hosts. Solo hay deriva de red si ambos responden y concuerdan.
   * Offline, desacuerdo o una sola respuesta: no se actualiza el desfase que
   * bloquea y `offline` o `agreed: false` lo dicen.
   */
  async sampleTrustedTime(): Promise<NetworkTimeSample> {
    const hosts = trustedHosts.slice(0, 2);
    const drifts = await Promise.all(hosts.map(async (host) => ({ host, driftMs: await readHostDrift(host) })));
    const ok = drifts.filter((d): d is { host: string; driftMs: number } => d.driftMs !== null);
    if (ok.length < 2) {
      lastSampleOnline = false;
      return { driftMs: null, agreed: false, offline: ok.length === 0, hosts: drifts };
    }
    const delta = Math.abs(ok[0].driftMs - ok[1].driftMs);
    if (delta > TIME_SOURCE_AGREEMENT_MS) {
      lastSampleOnline = false;
      return { driftMs: null, agreed: false, offline: false, hosts: drifts };
    }
    const driftMs = Math.round((ok[0].driftMs + ok[1].driftMs) / 2);
    lastSampleOnline = true;
    lastReferenceOffsetMs = driftMs;
    return { driftMs, agreed: true, offline: false, hosts: drifts };
  },

  /** Solo tests: sin red y sin desfase de referencia. */
  __resetForTests(): void {
    referenceUrl = null;
    trustedHosts = TRUSTED_TIME_HOSTS;
    lastReferenceOffsetMs = null;
    lastSampleOnline = false;
    fetchImpl = async () => {
      throw new Error("offline");
    };
  },

  /** Solo tests: sustituye el fetch de las cabeceras Date. */
  __setFetch(fn: ((url: string) => Promise<HeaderResponse>) | null): void {
    fetchImpl = fn ?? (async (url) => fetch(url, { method: "HEAD" }));
  },
};

const HOST_TIMEOUT_MS = 4_000;

async function readHostDrift(url: string): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const before = Date.now();
    const res = await Promise.race([
      fetchImpl(url),
      new Promise<HeaderResponse>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), HOST_TIMEOUT_MS);
      }),
    ]);
    const after = Date.now();
    const header = res.headers.get("date") ?? res.headers.get("Date");
    if (!header) return null;
    const refMs = parseTimestamp(header);
    if (refMs === null) return null;
    const deviceMid = before + (after - before) / 2;
    return deviceMid - refMs;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type TimeAuthority = typeof TimeAuthorityService;
