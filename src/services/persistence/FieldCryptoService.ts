/**
 * FieldCryptoService — Persistencia (spec FieldCryptoService v1.3 §8–§14)
 * ============================================================================
 * Cifrado de campos sensibles con AES-256-GCM (@noble/ciphers) y clave maestra
 * (MK) de 32 bytes en el llavero del sistema (KeyStore, §9).
 *
 * Sobre:  enc:v1:<kid>:<fieldId>:<ivB64url>:<ctAndTagB64url>
 * AAD:    "dt-fc|v1|" + kid + "|" + fieldId + "|" + rowId   ("v1" = versión del
 *         sobre, independiente de SCHEMA_VERSION; rowId impide copiar sobres
 *         entre filas del mismo campo).
 * IV:     12 bytes aleatorios por encrypt (expo-crypto.getRandomBytes).
 *
 * Estados (prioridad): UNINITIALIZED > UNAVAILABLE > KEY_MISSING > NEEDS_MIGRATE > READY.
 * KEY_MISSING y NEEDS_MIGRATE cifran con el kid activo; solo UNAVAILABLE
 * escribe `plain:v1:` con degraded = true (§12). No hay interruptor.
 *
 * noteDigest (§13): "hmac-sha256:v1:<kid>:<b64url>" con
 *   K_note = HKDF-SHA256(MK_kid, salt "dt-ledger", info "dt.noteDigest.v1", 32).
 *
 * El dominio (SessionEngine, IntegrityLedger) NO importa este servicio: el
 * digester se inyecta en boot.wirePorts (setNoteDigester).
 */
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as Crypto from "expo-crypto";
import { b64urlDecode, b64urlEncode, hexToBytes, utf8 } from "./cryptoCodec";
import { KeyStore, type KeyStorePort } from "./keyStore";

export type FieldId =
  | "session.note"
  | "site.alias"
  | "site.clientName"
  | "site.address"
  | "site.notes"
  | "site.coords"
  | "spatial.coords"
  | "settings.companyEmail"
  | "kv.lastFix";

export type CryptoStatus = "UNINITIALIZED" | "READY" | "NEEDS_MIGRATE" | "KEY_MISSING" | "UNAVAILABLE";

export type CryptoErrorCode = "CRYPTO_UNAVAILABLE" | "CRYPTO_TAMPER" | "CRYPTO_UNKNOWN_KID" | "CRYPTO_UNSUPPORTED" | "CRYPTO_TYPE";

export class FieldCryptoError extends Error {
  constructor(
    readonly code: CryptoErrorCode,
    readonly fieldId: FieldId | string,
    readonly kid: string | null = null,
  ) {
    super(`${code} (${fieldId}${kid ? `, ${kid}` : ""})`);
    this.name = "FieldCryptoError";
  }
}

/** Almacenamiento de metadatos (app_kv) y escaneo de kids en la base (§9, §14). */
export interface CryptoStoragePort {
  getKv<T>(key: string): Promise<T | null>;
  setKv(key: string, value: unknown): Promise<void>;
  /** Kids distintos presentes en las columnas del inventario (sobres enc:v1:). */
  scanKids(): Promise<string[]>;
}

export const ENVELOPE_PREFIX = "enc:v1:";
export const PLAIN_PREFIX = "plain:v1:";
/** Prefijo que nunca se escribió (Fase 5 de 8df2b9a). */
const NEVER_WRITTEN_PREFIX = "aesgcm:v1:";
export const LEGACY_KEY_ALIAS = "dualtracker.fieldcrypto.key.v1";
export const KV_ACTIVE_KID = "crypto.active_kid";
export const KV_KIDS = "crypto.kids";
const slotOf = (kid: string) => `dt.mk.${kid}`;
const NOTE_DIGEST_PREFIX = "hmac-sha256:v1:";

function aad(kid: string, fieldId: string, rowId: string): Uint8Array {
  return utf8.encode(`dt-fc|v1|${kid}|${fieldId}|${rowId}`);
}

const kidNum = (kid: string) => {
  const m = /^k(\d+)$/.exec(kid);
  return m ? Number(m[1]) : 0;
};

// ---------------------------------------------------------------------------
// Estado del proceso
// ---------------------------------------------------------------------------
interface State {
  status: CryptoStatus;
  activeKid: string | null;
  keys: Map<string, Uint8Array>;
  lostKids: string[];
  needsMigrate: boolean;
  initPromise: Promise<void> | null;
  noteKeys: Map<string, Uint8Array>;
}
const fresh = (): State => ({
  status: "UNINITIALIZED",
  activeKid: null,
  keys: new Map(),
  lostKids: [],
  needsMigrate: false,
  initPromise: null,
  noteKeys: new Map(),
});
let state: State = fresh();
let storage: CryptoStoragePort | null = null;
let keyStore: KeyStorePort = KeyStore;
/** Fallback en memoria si no hay almacenamiento conectado (tests unitarios puros). */
const memoryKv = new Map<string, unknown>();

function kv(): CryptoStoragePort {
  return (
    storage ?? {
      getKv: async <T>(k: string) => (memoryKv.has(k) ? (memoryKv.get(k) as T) : null),
      setKv: async (k: string, v: unknown) => void memoryKv.set(k, v),
      scanKids: async () => [],
    }
  );
}

function computeStatus(): CryptoStatus {
  if (!state.activeKid) return "UNAVAILABLE";
  if (state.lostKids.length) return "KEY_MISSING";
  if (state.needsMigrate) return "NEEDS_MIGRATE";
  return "READY";
}

async function readSlot(kid: string): Promise<Uint8Array | null> {
  const raw = await keyStore.get(slotOf(kid));
  if (!raw) return null;
  try {
    const bytes = b64urlDecode(raw);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

async function writeSlotVerified(kid: string, key: Uint8Array): Promise<void> {
  const enc = b64urlEncode(key);
  await keyStore.set(slotOf(kid), enc);
  const back = await keyStore.get(slotOf(kid));
  if (back !== enc) throw new Error(`KeyStore: verificación del slot ${kid} fallida`);
}

/** §9: dualtracker.fieldcrypto.key.v1 (hex) → dt.mk.k1 con los mismos bytes; se verifica y se borra el alias. */
async function migrateLegacyAlias(kids: string[]): Promise<string[]> {
  const legacy = await keyStore.get(LEGACY_KEY_ALIAS);
  if (!legacy) return kids;
  const bytes = hexToBytes(legacy);
  if (!bytes) return kids;
  const existing = await readSlot("k1");
  if (!existing) await writeSlotVerified("k1", bytes);
  else if (b64urlEncode(existing) !== b64urlEncode(bytes)) return kids; // no se pisa un k1 distinto
  await keyStore.delete(LEGACY_KEY_ALIAS);
  return kids.includes("k1") ? kids : [...kids, "k1"];
}

async function doEnsure(): Promise<void> {
  const next = fresh();
  try {
    if (!keyStore.platformSupported) throw new Error("plataforma sin almacén seguro");
    const store = kv();
    let kids = [...((await store.getKv<string[]>(KV_KIDS)) ?? [])];
    let active = await store.getKv<string>(KV_ACTIVE_KID);
    const hadLegacy = !!(await keyStore.get(LEGACY_KEY_ALIAS));
    kids = await migrateLegacyAlias(kids);
    if (hadLegacy && !active) active = "k1";
    for (const k of await store.scanKids()) if (!kids.includes(k)) kids.push(k);

    for (const kid of kids) {
      const key = await readSlot(kid);
      if (key) next.keys.set(kid, key);
      else next.lostKids.push(kid);
    }
    if (!kids.length) {
      // Sin kids ni datos cifrados: primera clave. Si el llavero ya tiene un k1
      // (p. ej. iOS conserva el llavero tras reinstalar), se adopta: nunca se pisa un slot.
      const existing = await readSlot("k1");
      const key = existing ?? Crypto.getRandomBytes(32);
      if (!existing) await writeSlotVerified("k1", key);
      next.keys.set("k1", key);
      kids = ["k1"];
      active = "k1";
    }
    if (!active || !next.keys.has(active)) {
      // §14: el kid activo se perdió → kid siguiente (máximo + 1), nunca el slot de uno perdido.
      const max = kids.reduce((m, k) => Math.max(m, kidNum(k)), 0);
      const kid = `k${max + 1}`;
      const key = Crypto.getRandomBytes(32);
      await writeSlotVerified(kid, key);
      next.keys.set(kid, key);
      kids.push(kid);
      active = kid;
    }
    await store.setKv(KV_KIDS, kids);
    await store.setKv(KV_ACTIVE_KID, active);
    next.activeKid = active;
    next.needsMigrate = state.needsMigrate;
    state = { ...next, initPromise: state.initPromise };
    state.status = computeStatus();
  } catch {
    state = { ...fresh(), status: "UNAVAILABLE", initPromise: state.initPromise, needsMigrate: state.needsMigrate };
  }
}

async function ready(): Promise<void> {
  if (state.status === "UNINITIALIZED") await FieldCryptoService.ensureMasterKey();
}

function parseEnvelope(stored: string, fieldId: FieldId): { kid: string; iv: Uint8Array; ct: Uint8Array } {
  const parts = stored.slice(ENVELOPE_PREFIX.length).split(":");
  if (parts.length !== 4) throw new FieldCryptoError("CRYPTO_TAMPER", fieldId);
  const [kid, fid, ivB64, ctB64] = parts;
  if (fid !== fieldId) throw new FieldCryptoError("CRYPTO_TAMPER", fieldId, kid);
  try {
    const iv = b64urlDecode(ivB64);
    const ct = b64urlDecode(ctB64);
    if (iv.length !== 12 || ct.length < 16) throw new Error("tamaño");
    return { kid, iv, ct };
  } catch {
    throw new FieldCryptoError("CRYPTO_TAMPER", fieldId, kid);
  }
}

function normalizeJson(fieldId: FieldId, value: unknown): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FieldCryptoError("CRYPTO_TYPE", fieldId);
    return Number(value.toFixed(7));
  }
  if (Array.isArray(value)) return value.map((v) => normalizeJson(fieldId, v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeJson(fieldId, v);
    return out;
  }
  return value;
}

export const FieldCryptoService = {
  // ------------------------------------------------------------------ estado
  status(): CryptoStatus {
    return state.status;
  },
  activeKid(): string | null {
    return state.activeKid;
  },
  lostKids(): string[] {
    return [...state.lostKids];
  },
  platformSupported(): boolean {
    return keyStore.platformSupported;
  },

  /** PersistenceService conecta app_kv y el escaneo de kids al abrir la base. */
  attachStorage(port: CryptoStoragePort | null): void {
    storage = port;
  },

  /**
   * Carga el kid activo en la caché del proceso; migra el alias viejo; sin
   * kids genera k1; con kids sin slot → KEY_MISSING (+ kid nuevo activo).
   * Idempotente, nunca rota por su cuenta y nunca lanza (fallo → UNAVAILABLE).
   */
  async ensureMasterKey(): Promise<void> {
    if (state.status !== "UNINITIALIZED" && state.status !== "UNAVAILABLE") return;
    if (!state.initPromise) {
      const p = doEnsure().finally(() => {
        state.initPromise = null;
      });
      state.initPromise = p;
    }
    await state.initPromise;
  },

  /** Recalcula la pérdida de clave (integritySweep, §14): añade kids de sobres sin slot. */
  async detectLostKids(): Promise<string[]> {
    await ready();
    if (state.status === "UNAVAILABLE") return [];
    for (const kid of await kv().scanKids()) {
      if (state.keys.has(kid) || state.lostKids.includes(kid)) continue;
      const key = await readSlot(kid).catch(() => null);
      if (key) state.keys.set(kid, key);
      else state.lostKids.push(kid);
    }
    state.status = computeStatus();
    return [...state.lostKids];
  },

  /** §7: el paso de datos marca NEEDS_MIGRATE si una fila no verifica. */
  setNeedsMigrate(v: boolean): void {
    state.needsMigrate = v;
    if (state.status !== "UNINITIALIZED" && state.status !== "UNAVAILABLE") state.status = computeStatus();
  },

  // ------------------------------------------------------------------ helpers puros
  isPlain(stored: string | null | undefined): boolean {
    return typeof stored === "string" && !stored.startsWith(ENVELOPE_PREFIX) && !/^enc:v\d+:/.test(stored) && !stored.startsWith(NEVER_WRITTEN_PREFIX);
  },
  isCipher(stored: string | null | undefined): boolean {
    return typeof stored === "string" && stored.startsWith(ENVELOPE_PREFIX);
  },
  kidOf(stored: string | null | undefined): string | null {
    if (!FieldCryptoService.isCipher(stored)) return null;
    return stored!.slice(ENVELOPE_PREFIX.length).split(":")[0] || null;
  },

  // ------------------------------------------------------------------ API canónica
  async encrypt(fieldId: FieldId, rowId: string | number, plaintext: string | null | undefined): Promise<{ stored: string | null; degraded: boolean }> {
    if (plaintext === null || plaintext === undefined) return { stored: null, degraded: false };
    if (typeof plaintext !== "string") throw new FieldCryptoError("CRYPTO_TYPE", fieldId);
    await ready();
    const kid = state.activeKid;
    const key = kid ? state.keys.get(kid) : undefined;
    if (!kid || !key) return { stored: `${PLAIN_PREFIX}${plaintext}`, degraded: true };
    const iv = Crypto.getRandomBytes(12);
    const ct = gcm(key, iv, aad(kid, fieldId, String(rowId))).encrypt(utf8.encode(plaintext));
    return { stored: `${ENVELOPE_PREFIX}${kid}:${fieldId}:${b64urlEncode(iv)}:${b64urlEncode(ct)}`, degraded: false };
  },

  async decrypt(fieldId: FieldId, rowId: string | number, stored: string | null | undefined): Promise<string | null> {
    if (stored === null || stored === undefined) return null;
    if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
    if (stored.startsWith(NEVER_WRITTEN_PREFIX)) throw new FieldCryptoError("CRYPTO_UNSUPPORTED", fieldId);
    if (!stored.startsWith(ENVELOPE_PREFIX)) {
      if (/^enc:v\d+:/.test(stored)) throw new FieldCryptoError("CRYPTO_UNSUPPORTED", fieldId);
      return stored; // legado sin prefijo
    }
    const { kid, iv, ct } = parseEnvelope(stored, fieldId);
    await ready();
    if (state.status === "UNAVAILABLE") throw new FieldCryptoError("CRYPTO_UNAVAILABLE", fieldId, kid);
    const key = state.keys.get(kid);
    if (!key) throw new FieldCryptoError("CRYPTO_UNKNOWN_KID", fieldId, kid);
    try {
      return utf8.decode(gcm(key, iv, aad(kid, fieldId, String(rowId))).decrypt(ct));
    } catch {
      throw new FieldCryptoError("CRYPTO_TAMPER", fieldId, kid);
    }
  },

  /** JSON con números a 7 decimales (≈1,1 cm); no finitos → CRYPTO_TYPE. */
  async encryptJson(fieldId: FieldId, rowId: string | number, value: unknown): Promise<{ stored: string | null; degraded: boolean }> {
    if (value === null || value === undefined) return { stored: null, degraded: false };
    return FieldCryptoService.encrypt(fieldId, rowId, JSON.stringify(normalizeJson(fieldId, value)));
  },

  async decryptJson<T>(fieldId: FieldId, rowId: string | number, stored: string | null | undefined): Promise<T | null> {
    const raw = await FieldCryptoService.decrypt(fieldId, rowId, stored);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new FieldCryptoError("CRYPTO_TYPE", fieldId);
    }
  },

  /** §13: HMAC-SHA256 de la nota con K_note derivada por HKDF de la MK activa. */
  async noteDigest(note: string | null | undefined): Promise<string | null> {
    const text = (note ?? "").trim();
    if (!text) return null;
    await ready();
    const kid = state.activeKid;
    const mk = kid ? state.keys.get(kid) : undefined;
    if (!kid || !mk) return null;
    let k = state.noteKeys.get(kid);
    if (!k) {
      k = hkdf(sha256, mk, utf8.encode("dt-ledger"), utf8.encode("dt.noteDigest.v1"), 32);
      state.noteKeys.set(kid, k);
    }
    return `${NOTE_DIGEST_PREFIX}${kid}:${b64urlEncode(hmac(sha256, k, utf8.encode(text)))}`;
  },

  // ------------------------------------------------------------------ tests
  /** Solo tests: estado del proceso a cero (llamado desde test/setup.ts). */
  __resetForTests(): void {
    state = fresh();
    memoryKv.clear();
    keyStore = KeyStore;
    KeyStore.__reset();
  },
  /** Solo tests: sustituye el puerto del llavero. */
  __setKeyStore(port: KeyStorePort | null): void {
    keyStore = port ?? KeyStore;
  },
  /** Solo tests: fuerza a re-ejecutar ensureMasterKey (simula un reinicio del proceso). */
  __forgetCache(): void {
    state = fresh();
  },
};
