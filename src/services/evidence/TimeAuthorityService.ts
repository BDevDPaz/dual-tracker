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
import {
  CLOCK_DRIFT_CONSISTENCY_MS,
  CLOCK_DRIFT_CONFIRM_SAMPLES,
  CLOCK_DRIFT_CONFIRM_SPAN_MS,
  CLOCK_DRIFT_THRESHOLD_MS,
  CLOCK_SAMPLE_MAX_RTT_MS,
  CLOCK_SAMPLE_MIN_INTERVAL_MS,
  FUTURE_TIME_TOLERANCE_MS,
  TIME_SOURCE_AGREEMENT_MS,
} from "../../config/provisional";
import { parseTimestamp, toDateString } from "../../utils/dateUtils";

export {
  CLOCK_DRIFT_CONSISTENCY_MS,
  CLOCK_DRIFT_CONFIRM_SAMPLES,
  CLOCK_DRIFT_CONFIRM_SPAN_MS,
  CLOCK_DRIFT_THRESHOLD_MS,
  CLOCK_SAMPLE_MAX_RTT_MS,
  CLOCK_SAMPLE_MIN_INTERVAL_MS,
  TIME_SOURCE_AGREEMENT_MS,
};

const monotonicNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

let wallAnchor = Date.now();
let monoAnchor = monotonicNow();

/**
 * Dos orígenes HTTPS conocidos. La deriva de red solo cuenta si los dos
 * responden y concuerdan (cabecera Date, resolución de 1 s). Sin red no se
 * bloquea VALIDADA por este camino.
 */
export const TRUSTED_TIME_HOSTS = ["https://www.google.com/generate_204", "https://www.cloudflare.com/cdn-cgi/trace"] as const;

/** URL opcional de una sola fuente (pruebas y configuración manual). */
let referenceUrl: string | null = null;
let trustedHosts: readonly string[] = TRUSTED_TIME_HOSTS;
/** true solo tras una muestra de red que respondió. Offline no bloquea. */
let lastSampleOnline = false;
/**
 * Última hora de red validada (las dos fuentes concordaron) y el reloj
 * monótono en ese instante. Sirve para extrapolar sin seguir un salto del
 * reloj de pared.
 */
let networkAtSampleMs: number | null = null;
let monoAtSample: number | null = null;

function rememberAgreedDrift(driftMs: number): void {
  const device = Date.now();
  networkAtSampleMs = device - driftMs;
  monoAtSample = monotonicNow();
}

type HeaderResponse = { headers: { get(name: string): string | null } };
let fetchImpl: (url: string) => Promise<HeaderResponse> = async (url) => fetch(url, { method: "HEAD" });

export interface NetworkTimeSample {
  /** Desfase dispositivo − referencia, ms. null si no hubo acuerdo o no hubo red. */
  driftMs: number | null;
  agreed: boolean;
  offline: boolean;
  /** true si alguna respuesta llegó pero se tiró por ida y vuelta alta. */
  discardedRtt: boolean;
  hosts: { host: string; driftMs: number | null; rttMs: number | null }[];
}

export const TimeAuthorityService = {
  /** Timestamp canónico en ms (reloj del dispositivo). */
  now(): number {
    return Date.now();
  },

  /**
   * Hora de confianza: el máximo entre el reloj del dispositivo y la hora de
   * red validada (si hay una muestra en la que las dos fuentes concordaron).
   * Sin red, es el reloj del dispositivo.
   */
  trustedNow(): number {
    const device = Date.now();
    if (networkAtSampleMs === null || monoAtSample === null) return device;
    const network = networkAtSampleMs + (monotonicNow() - monoAtSample);
    return Math.max(device, network);
  },

  /** Último instante que se puede anotar: hora de confianza más la tolerancia. */
  futureCeiling(): number {
    return TimeAuthorityService.trustedNow() + FUTURE_TIME_TOLERANCE_MS;
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

  /**
   * Deriva local que puede bloquear VALIDADA. La hora de red no entra:
   * una muestra de Google/Cloudflare avisa, no mueve este número.
   */
  currentDriftMs(): number {
    return Math.abs(TimeAuthorityService.measureLocalDriftMs());
  },

  /**
   * true solo si el reloj de pared saltó respecto del monótono. La hora de
   * red no bloquea por sí sola (prueba de campo 19 oct 2026).
   */
  isDriftExceeded(): boolean {
    return Math.abs(TimeAuthorityService.measureLocalDriftMs()) > CLOCK_DRIFT_THRESHOLD_MS;
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
    if (!sample || sample.driftMs === null) {
      lastSampleOnline = false;
      return null;
    }
    lastSampleOnline = true;
    return sample.driftMs;
  },

  /**
   * Dos hosts. Hay lectura si ambos responden, la ida y vuelta cabe en el
   * tope y las cabeceras concuerdan. El desfase es el punto medio de cada
   * ida y vuelta. No bloquea VALIDADA: quien decide el aviso es observeClock.
   */
  async sampleTrustedTime(): Promise<NetworkTimeSample> {
    const hosts = trustedHosts.slice(0, 2);
    const drifts = await Promise.all(hosts.map(async (host) => ({ host, ...(await readHostDrift(host)) })));
    const rows = drifts.map((d) => ({
      host: d.host,
      driftMs: d.driftMs,
      rttMs: d.rttMs,
    }));
    const discardedRtt = drifts.some((d) => d.discardedRtt);
    const ok = drifts.filter((d): d is { host: string; driftMs: number; rttMs: number; discardedRtt: false } => d.driftMs !== null && !d.discardedRtt);
    if (ok.length < 2) {
      lastSampleOnline = false;
      const answered = drifts.filter((d) => d.rttMs !== null || d.driftMs !== null).length;
      return { driftMs: null, agreed: false, offline: answered === 0 && !discardedRtt, discardedRtt, hosts: rows };
    }
    const delta = Math.abs(ok[0].driftMs - ok[1].driftMs);
    if (delta > TIME_SOURCE_AGREEMENT_MS) {
      lastSampleOnline = false;
      return { driftMs: null, agreed: false, offline: false, discardedRtt, hosts: rows };
    }
    const driftMs = Math.round((ok[0].driftMs + ok[1].driftMs) / 2);
    lastSampleOnline = true;
    rememberAgreedDrift(driftMs);
    return { driftMs, agreed: true, offline: false, discardedRtt, hosts: rows };
  },

  /** Solo tests: sin red y sin desfase de referencia. */
  __resetForTests(): void {
    referenceUrl = null;
    trustedHosts = TRUSTED_TIME_HOSTS;
    lastSampleOnline = false;
    networkAtSampleMs = null;
    monoAtSample = null;
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

interface HostDrift {
  driftMs: number | null;
  rttMs: number | null;
  discardedRtt: boolean;
}

const HOST_MISS: HostDrift = { driftMs: null, rttMs: null, discardedRtt: false };

/**
 * Desfase (dispositivo − cabecera Date) con el punto medio de la ida y
 * vuelta. Una respuesta lenta se descarta: la cabecera solo tiene segundos
 * y un RTT alto no es un reloj movido.
 */
async function readHostDrift(url: string): Promise<HostDrift> {
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
    const rttMs = after - before;
    if (rttMs > CLOCK_SAMPLE_MAX_RTT_MS) return { driftMs: null, rttMs, discardedRtt: true };
    const header = res.headers.get("date") ?? res.headers.get("Date");
    if (!header) return HOST_MISS;
    const refMs = parseTimestamp(header);
    if (refMs === null) return HOST_MISS;
    const deviceMid = before + rttMs / 2;
    return { driftMs: deviceMid - refMs, rttMs, discardedRtt: false };
  } catch {
    return HOST_MISS;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type TimeAuthority = typeof TimeAuthorityService;
