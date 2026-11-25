/**
 * Casos de uso: copia de seguridad de la app (solo Ajustes).
 * ============================================================================
 *  - exportAppBackup: vuelca los datos (backupStore), los cifra con la
 *    contraseña (backupCodec), escribe `.dtbackup` en la caché y abre la hoja
 *    de compartir. No pide permisos de almacenamiento.
 *  - previewBackupImport: elige el archivo con el selector del sistema (SAF en
 *    Android, `File.pickFileAsync`), lo descifra y lo valida entero: formato y
 *    versión, versión de esquema, columnas, jornadas cerradas, cadena del libro
 *    y sello de cada expediente. No escribe nada. Deja el contenido validado
 *    en memoria con un token de 10 minutos; la contraseña no se guarda.
 *  - importAppBackup: con ese token, REEMPLAZO TOTAL en una sola transacción
 *    (backupStore.replaceAllFromBackup + asiento BACKUP_RESTORED). Si algo
 *    falla, ROLLBACK: los datos del teléfono quedan como estaban.
 * Reportes no usa nada de aquí: los documentos de nómina no son restaurables.
 */
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { APP_VERSION } from "../../../constants/app";
import type { IntentResult, LedgerEntry } from "../../../core/contracts";
import { OPEN_SESSION_STATES } from "../../../core/contracts";
import { markPersisted } from "../../../core/refresh/dataRevision";
import { setLanguage } from "../../../i18n";
import { canonicalJson } from "../../../utils/canonicalJson";
import { serializeError } from "../../../utils/serializeError";
import { IntegrityLedgerService, verifyLedgerEntries } from "../../domain/IntegrityLedgerService";
import { chainHash, sha256Hex } from "../../evidence/HashChain";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import {
  BACKUP_FILE_EXTENSION,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupCodecError,
  decryptBackup,
  encryptBackup,
  passphraseLongEnough,
} from "../../persistence/backupCodec";
import { BACKUP_TABLES, dumpForBackup, replaceAllFromBackup, unknownBackupColumns, type BackupData, type BackupRow } from "../../persistence/backupStore";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService, mapLedgerRow } from "../../persistence/PersistenceService";
import { KV_KEYS, SCHEMA_VERSION } from "../../persistence/schema";
import { SettingsService } from "../../persistence/SettingsService";
import { NotificationService } from "../../runtime/NotificationService";
import { SecurityService } from "../../runtime/SecurityService";
import { refreshMirror } from "../refreshMirror";
import { checkLedgerIntegrity } from "./ledgerIntegrity";

/** Contenido descifrado del archivo. */
export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  createdAtMs: number;
  data: BackupData;
}

export interface BackupSummary {
  createdAtMs: number;
  appVersion: string;
  sessions: number;
  sites: number;
  packs: number;
  ledgerEntries: number;
  fromMs: number | null;
  toMs: number | null;
  unreadable: number;
}

export interface BackupStatus {
  lastCreatedAtMs: number | null;
}

type Scrypt = { N: number; r: number; p: number };

const PREVIEW_TTL_MS = 10 * 60_000;
let pending: { token: string; payload: BackupPayload; summary: BackupSummary; expiresAtMs: number } | null = null;

function summarize(payload: BackupPayload): BackupSummary {
  const sessions = payload.data.tables.sessions.filter((s) => !Number(s.is_deleted));
  const starts = sessions.map((s) => Number(s.actual_start_ms ?? s.declared_start_ms)).filter(Number.isFinite);
  const ends = sessions.map((s) => Number(s.end_ms ?? s.actual_start_ms ?? s.declared_start_ms)).filter(Number.isFinite);
  return {
    createdAtMs: payload.createdAtMs,
    appVersion: payload.appVersion,
    sessions: sessions.length,
    sites: payload.data.tables.sites.length,
    packs: payload.data.tables.evidence_packs.length,
    ledgerEntries: payload.data.tables.ledger_entries.length,
    fromMs: starts.length ? Math.min(...starts) : null,
    toMs: ends.length ? Math.max(...ends) : null,
    unreadable: payload.data.unreadable.length,
  };
}

function backupFileName(nowMs: number): string {
  return `DualTracker_copia_${new Date(nowMs).toISOString().slice(0, 10)}.${BACKUP_FILE_EXTENSION}`;
}

async function adminAllowed(): Promise<boolean> {
  return !(await SecurityService.hasPin()) || SecurityService.isUnlocked();
}

export async function readBackupStatus(): Promise<BackupStatus> {
  const last = await PersistenceService.getKv<{ atMs?: unknown }>(KV_KEYS.BACKUP_LAST).catch(() => null);
  return { lastCreatedAtMs: typeof last?.atMs === "number" ? last.atMs : null };
}

export async function exportAppBackup(passphrase: string, opts: { scrypt?: Scrypt } = {}): Promise<IntentResult<{ uri: string; name: string }>> {
  if (!passphraseLongEnough(passphrase)) return { ok: false, code: "BACKUP_PASSPHRASE_SHORT" };
  if ((await PersistenceService.countOpenSessions()) > 0) return { ok: false, code: "BACKUP_OPEN_SESSION" };
  const nowMs = TimeAuthorityService.now();
  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAtMs: nowMs,
    data: await dumpForBackup(),
  };
  const text = await encryptBackup(JSON.stringify(payload), passphrase, opts);
  const dir = new Directory(Paths.cache, "backups");
  dir.create({ intermediates: true, idempotent: true });
  const name = backupFileName(nowMs);
  const file = new File(dir, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  let shared = false;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "application/octet-stream", dialogTitle: name });
      shared = true;
    }
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al compartir la copia de seguridad", serializeError(error));
  }
  if (!shared) return { ok: false, code: "SHARE_UNAVAILABLE" };
  const summary = summarize(payload);
  await PersistenceService.setKv(KV_KEYS.BACKUP_LAST, { atMs: nowMs, sessions: summary.sessions, packs: summary.packs });
  markPersisted("settings");
  LoggingService.log("VERDE", "OPERACION_EXITOSA", "INFO", "Copia de seguridad creada", { sessions: summary.sessions, packs: summary.packs });
  return { ok: true, data: { uri: file.uri, name } };
}

function isRowArray(v: unknown): v is BackupRow[] {
  return Array.isArray(v) && v.every((r) => !!r && typeof r === "object" && !Array.isArray(r));
}

async function packFailure(row: BackupRow, ledgerById: Map<number, LedgerEntry>): Promise<boolean> {
  try {
    const manifest = JSON.parse(String(row.manifest_json));
    const statement = JSON.parse(String(row.statement_json));
    const evidence = JSON.parse(String(row.evidence_json));
    if (manifest.packHash !== row.pack_hash || statement.packHash !== manifest.packHash || manifest.packId !== row.id) return true;
    if ((await sha256Hex(canonicalJson(evidence))) !== manifest.evidenceHash) return true;
    for (const h of (evidence.ledgerHashes ?? []) as { id: number; hash: string; prevHash?: string; payloadJson?: string }[]) {
      if (ledgerById.get(h.id)?.hash !== h.hash) return true;
      if (typeof h.prevHash === "string" && typeof h.payloadJson === "string" && (await chainHash(h.prevHash, h.payloadJson)) !== h.hash) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Valida el contenido descifrado. No escribe. */
export async function validateBackupPayload(raw: unknown): Promise<IntentResult<BackupPayload>> {
  const p = raw as Partial<BackupPayload> | null;
  if (!p || p.format !== BACKUP_FORMAT || p.formatVersion !== BACKUP_FORMAT_VERSION || typeof p.createdAtMs !== "number") {
    return { ok: false, code: "BACKUP_INVALID" };
  }
  const data = p.data as Partial<BackupData> | undefined;
  if (!data || typeof data.schemaVersion !== "number" || !data.tables || !data.kv || !Array.isArray(data.unreadable)) return { ok: false, code: "BACKUP_INVALID" };
  if (data.schemaVersion > SCHEMA_VERSION) return { ok: false, code: "BACKUP_NEWER_SCHEMA" };
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return { ok: false, code: "BACKUP_INVALID" };
  for (const table of BACKUP_TABLES) if (!isRowArray(data.tables[table])) return { ok: false, code: "BACKUP_INVALID" };
  const full = data as BackupData;
  if ((await unknownBackupColumns(full)).length) return { ok: false, code: "BACKUP_INVALID" };
  // Una copia nunca lleva jornada abierta (exportAppBackup lo impide).
  if (full.tables.sessions.some((s) => !Number(s.is_deleted) && OPEN_SESSION_STATES.includes(String(s.domain_status) as (typeof OPEN_SESSION_STATES)[number]))) {
    return { ok: false, code: "BACKUP_INVALID" };
  }
  let ledger: LedgerEntry[];
  try {
    ledger = full.tables.ledger_entries.map((r) => mapLedgerRow(r)).sort((a, b) => a.id - b.id);
  } catch {
    return { ok: false, code: "BACKUP_INVALID" };
  }
  const verification = await verifyLedgerEntries(ledger);
  if (!verification.valid) return { ok: false, code: "BACKUP_CHAIN_BROKEN" };
  const byId = new Map(ledger.map((e) => [e.id, e]));
  for (const pack of full.tables.evidence_packs) {
    if (await packFailure(pack, byId)) return { ok: false, code: "BACKUP_PACK_INVALID" };
  }
  return { ok: true, data: p as BackupPayload };
}

function codecCode(error: unknown): string {
  return error instanceof BackupCodecError ? error.code : "BACKUP_INVALID";
}

export async function previewBackupImport(passphrase: string): Promise<IntentResult<{ token: string; summary: BackupSummary }>> {
  pending = null;
  if (!(await adminAllowed())) return { ok: false, code: "ADMIN_LOCKED" };
  if ((await PersistenceService.countOpenSessions()) > 0) return { ok: false, code: "BACKUP_OPEN_SESSION" };
  if (!passphraseLongEnough(passphrase)) return { ok: false, code: "BACKUP_WRONG_PASSWORD" };
  let picked: { text(): Promise<string> };
  try {
    const result = await File.pickFileAsync(undefined, "*/*");
    const first = Array.isArray(result) ? result[0] : result;
    if (!first) return { ok: false, code: "BACKUP_PICK_CANCELLED" };
    picked = first;
  } catch {
    // El selector lanza también cuando la persona lo cierra sin elegir.
    return { ok: false, code: "BACKUP_PICK_CANCELLED" };
  }
  let text: string;
  try {
    text = await picked.text();
  } catch {
    return { ok: false, code: "BACKUP_FILE_UNREADABLE" };
  }
  let json: string;
  try {
    json = await decryptBackup(text, passphrase);
  } catch (error) {
    return { ok: false, code: codecCode(error) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, code: "BACKUP_INVALID" };
  }
  const valid = await validateBackupPayload(parsed);
  if (!valid.ok) return valid;
  const payload = valid.data!;
  const summary = summarize(payload);
  const token = Crypto.randomUUID();
  pending = { token, payload, summary, expiresAtMs: TimeAuthorityService.now() + PREVIEW_TTL_MS };
  return { ok: true, data: { token, summary } };
}

export function cancelBackupImport(): void {
  pending = null;
}

/** Los PDF no viajan: una URI que no existe en este teléfono queda en null. */
function withLocalArtifacts(data: BackupData): BackupData {
  const packs = data.tables.evidence_packs.map((row) => {
    const next = { ...row };
    for (const col of ["employee_pdf_uri", "employer_pdf_uri", "manifest_uri"]) {
      const uri = next[col];
      if (typeof uri !== "string" || !uri) continue;
      let exists = false;
      try {
        exists = new File(uri).exists;
      } catch {
        exists = false;
      }
      if (!exists) next[col] = null;
    }
    return next;
  });
  return { ...data, tables: { ...data.tables, evidence_packs: packs } };
}

export async function importAppBackup(token: string): Promise<IntentResult<BackupSummary>> {
  const current = pending;
  if (!current || current.token !== token || TimeAuthorityService.now() > current.expiresAtMs) {
    pending = null;
    return { ok: false, code: "BACKUP_EXPIRED" };
  }
  if (!(await adminAllowed())) return { ok: false, code: "ADMIN_LOCKED" };
  if ((await PersistenceService.countOpenSessions()) > 0) return { ok: false, code: "BACKUP_OPEN_SESSION" };
  if ((await PersistenceService.listOffline("PENDING")).length > 0) return { ok: false, code: "BACKUP_QUEUE_PENDING" };
  const data = withLocalArtifacts(current.payload.data);
  const replacedHead = await PersistenceService.getLastLedgerEntry();
  const restored = data.tables.ledger_entries.reduce<BackupRow | null>((top, r) => (!top || Number(r.id) > Number(top.id) ? r : top), null);
  try {
    await PersistenceService.transaction(async (db) => {
      await replaceAllFromBackup(db, data);
      await IntegrityLedgerService.append(
        {
          sessionId: null,
          actor: "USER",
          intent: "BACKUP_RESTORED",
          fromState: null,
          toState: null,
          reason: "BACKUP_RESTORE",
          timestampMs: TimeAuthorityService.now(),
          integrityClass: null,
          data: {
            backupCreatedAtMs: current.payload.createdAtMs,
            backupAppVersion: current.payload.appVersion,
            sessions: current.summary.sessions,
            packs: current.summary.packs,
            ledgerEntries: current.summary.ledgerEntries,
            restoredHead: restored ? { id: Number(restored.id), hash: String(restored.hash) } : null,
            replacedHead: replacedHead ? { id: replacedHead.id, hash: replacedHead.hash } : null,
          },
        },
        db,
      );
    });
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Restauración de copia revertida", serializeError(error));
    return { ok: false, code: "BACKUP_RESTORE_FAILED" };
  }
  pending = null;
  LoggingService.log("NARANJA", "OPERACION_EXITOSA", "WARN", "Datos reemplazados desde una copia de seguridad", {
    sessions: current.summary.sessions,
    packs: current.summary.packs,
  });
  await checkLedgerIntegrity("FULL").catch((e) => LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Verificación tras restaurar falló", serializeError(e)));
  const settings = await SettingsService.load();
  setLanguage(settings.profile.language);
  await refreshMirror({ force: true }).catch(() => undefined);
  await NotificationService.scheduleDailyReminder(settings.profile.dailyReminderTime).catch(() => undefined);
  return { ok: true, data: current.summary };
}

/** Solo tests. */
export function __resetBackupImportForTests(): void {
  pending = null;
}
