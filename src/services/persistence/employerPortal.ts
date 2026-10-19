/**
 * Transporte hacia el portal del empleador.
 * ============================================================================
 * HTTPS POST del expediente firmado (manifiesto + estado de nómina + resumen
 * de evidencia). La clave de idempotencia es packHash. No hay teselas ni
 * coordenadas sueltas: el cuerpo es el JSON del sello.
 *
 * Desactivado por defecto. Sin URL https explícita no se llama a fetch.
 * Contrato: docs/PORTAL_EMPLEADOR.md.
 */
import type { EvidencePack } from "../../core/contracts";
import { PORTAL_BACKOFF_BASE_MS, PORTAL_BACKOFF_CAP_MS, PORTAL_TIMEOUT_MS } from "../../config/provisional";
import { canonicalJson } from "../../utils/canonicalJson";

export interface PortalPostBody {
  manifest: EvidencePack["manifest"];
  statement: EvidencePack["statement"];
  evidence: EvidencePack["evidence"];
}

export interface PortalPostResult {
  ok: boolean;
  status: number | null;
  retryable: boolean;
  error: string | null;
}

export type PortalSkipReason = "NOT_CONFIGURED" | "DISABLED" | "NOT_HTTPS";

export function parsePortalUrl(raw: string | null | undefined): { ok: true; url: string } | { ok: false; reason: "EMPTY" | "NOT_HTTPS" } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, reason: "EMPTY" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "NOT_HTTPS" };
  }
  if (url.protocol !== "https:" || !url.hostname) return { ok: false, reason: "NOT_HTTPS" };
  return { ok: true, url: url.toString() };
}

/** Nada se envía si falta la bandera o la URL https. */
export function portalSendDecision(company: {
  employerPortalEnabled?: boolean;
  employerPortalUrl?: string | null;
}): { send: true; url: string } | { send: false; reason: PortalSkipReason } {
  const parsed = parsePortalUrl(company.employerPortalUrl);
  if (!parsed.ok) return { send: false, reason: parsed.reason === "EMPTY" ? "NOT_CONFIGURED" : "NOT_HTTPS" };
  if (company.employerPortalEnabled !== true) return { send: false, reason: "DISABLED" };
  return { send: true, url: parsed.url };
}

export function portalBackoffMs(attemptsAfterFailure: number): number {
  const step = Math.max(0, Math.min(16, attemptsAfterFailure - 1));
  const delay = PORTAL_BACKOFF_BASE_MS * 2 ** step;
  return Math.min(PORTAL_BACKOFF_CAP_MS, delay);
}

export function packPostBody(pack: EvidencePack): PortalPostBody {
  return { manifest: pack.manifest, statement: pack.statement, evidence: pack.evidence };
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

let fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Solo pruebas. null restaura fetch global. */
export function __setPortalFetchForTests(fn: FetchLike | null): void {
  fetchImpl = fn ?? ((url, init) => fetch(url, init));
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Un POST. 2xx y 409 son éxito: 409 significa que ese packHash ya estaba
 * recibido (la clave de idempotencia es el propio hash). El resto de 4xx no
 * se reintenta. 408, 429 y 5xx sí.
 */
export async function postSignedPack(url: string, pack: EvidencePack, timeoutMs = PORTAL_TIMEOUT_MS): Promise<PortalPostResult> {
  const key = pack.manifest.packHash;
  const body = canonicalJson(packPostBody(pack));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body,
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true, status: res.status, retryable: false, error: null };
    if (res.status === 409) return { ok: true, status: res.status, retryable: false, error: null };
    const retryable = RETRYABLE.has(res.status);
    return { ok: false, status: res.status, retryable, error: `HTTP_${res.status}` };
  } catch (error) {
    const name = error instanceof Error ? error.name : "NETWORK";
    return { ok: false, status: null, retryable: true, error: name };
  } finally {
    clearTimeout(timer);
  }
}
