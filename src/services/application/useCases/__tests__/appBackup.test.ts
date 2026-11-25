/**
 * Copia de seguridad (Ajustes): exportar → otro teléfono → validar → reemplazo
 * total. Incluye los rechazos de validación y el ROLLBACK si falla a mitad.
 */
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { CREATE_TABLES_SQL } from "../../../persistence/schema";
import { getWeekEnd, getWeekStart } from "../../../../utils/dateUtils";
import { IntegrityLedgerService } from "../../../domain/IntegrityLedgerService";
import { FieldCryptoService } from "../../../persistence/FieldCryptoService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { SettingsService } from "../../../persistence/SettingsService";
import { encryptBackup } from "../../../persistence/backupCodec";
import { dumpForBackup } from "../../../persistence/backupStore";
import { SecurityService } from "../../../runtime/SecurityService";
import { routeIntent } from "../../intentRouter";
import { generateWeeklyPayroll } from "../generateWeeklyPayroll";
import {
  BackupPayload,
  __resetBackupImportForTests,
  exportAppBackup,
  importAppBackup,
  previewBackupImport,
  readBackupStatus,
  validateBackupPayload,
} from "../appBackup";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { acceptDisclosure, mustDispatch, seedSite, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { time } from "../../../../../test/time";

const PASS = "contraseña-larga-1";
const fs = FileSystem as unknown as { __files: Map<string, string>; __pickQueue: unknown[]; File: new (uri: string) => unknown };
const sqlite = require("expo-sqlite") as typeof import("../../../../../test/mocks/expo-sqlite");
const secureStore = require("expo-secure-store") as { __reset: () => void };

/** Un teléfono con una jornada cerrada con nota, dos destinos, un expediente sellado y correo de empresa. */
async function seedPhone(): Promise<{ sessionId: number; siteA: number }> {
  const { siteA } = await seedWorld();
  const s = await startAndArrive(siteA);
  await mustDispatch({ type: "ADD_NOTE", sessionId: s.id, note: "Llave en la maceta" });
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
  const settings = await SettingsService.load();
  await SettingsService.saveCompany({ ...settings.company, companyEmail: "rrhh@empresa.test" });
  const sealed = await generateWeeklyPayroll(getWeekStart(time.now()), getWeekEnd(time.now()));
  expect(sealed.ok).toBe(true);
  // El envío al portal ya se hizo: la cola no bloquea.
  for (const item of await PersistenceService.listOffline("PENDING")) await PersistenceService.updateOffline(item.id, "SYNCED", null);
  return { sessionId: s.id, siteA };
}

/** Teléfono nuevo: base vacía y llavero sin la clave anterior. Los PDF no están. */
async function newPhone(): Promise<void> {
  await sqlite.__resetAll(CREATE_TABLES_SQL);
  secureStore.__reset();
  FieldCryptoService.__resetForTests();
  for (const key of [...fs.__files.keys()]) if (key.includes("/packs/")) fs.__files.delete(key);
}

async function exportFile(): Promise<string> {
  const r = await exportAppBackup(PASS);
  expect(r.ok).toBe(true);
  return (r.ok && r.data!.uri) as string;
}

function pick(uri: string): void {
  fs.__pickQueue.push(new fs.File(uri));
}

async function db() {
  return PersistenceService.init();
}

async function ledgerDeleteBlocked(): Promise<boolean> {
  try {
    await (await db()).runAsync("DELETE FROM ledger_entries");
    return false;
  } catch {
    return true;
  }
}

async function payloadOf(): Promise<BackupPayload> {
  return { format: "dual-tracker-backup", formatVersion: 1, appVersion: "1.0.0", createdAtMs: time.now(), data: await dumpForBackup() };
}

beforeEach(() => __resetBackupImportForTests());

describe("copia de seguridad: exportar", () => {
  test("crea un .dtbackup cifrado, abre compartir y guarda la fecha de la última copia", async () => {
    await seedPhone();
    expect((await readBackupStatus()).lastCreatedAtMs).toBeNull();
    const uri = await exportFile();
    expect(uri).toMatch(/\/backups\/DualTracker_copia_\d{4}-\d{2}-\d{2}\.dtbackup$/);
    expect((Sharing as unknown as { __shared: string[] }).__shared).toContain(uri);
    const text = fs.__files.get(uri)!;
    expect(text).not.toContain("maceta");
    expect(text).not.toContain("Sitio A");
    expect(text).not.toContain("rrhh@");
    expect((await readBackupStatus()).lastCreatedAtMs).toBe(time.now());
  });

  test("con jornada abierta no se crea la copia", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    expect(await exportAppBackup(PASS)).toEqual({ ok: false, code: "BACKUP_OPEN_SESSION" });
  });

  test("contraseña corta → BACKUP_PASSPHRASE_SHORT (también por el router, con aviso)", async () => {
    await seedWorld();
    expect(await routeIntent({ type: "EXPORT_BACKUP", passphrase: "corta" })).toMatchObject({ ok: false, code: "BACKUP_PASSPHRASE_SHORT" });
  });
});

describe("copia de seguridad: restaurar en otro teléfono", () => {
  test("reemplazo total: mismos ids, campos legibles con la clave nueva, libro íntegro y asiento BACKUP_RESTORED", async () => {
    const { sessionId, siteA } = await seedPhone();
    const before = await (await db()).getFirstAsync<{ manual_note_sealed: string }>("SELECT manual_note_sealed FROM sessions WHERE id = ?", [sessionId]);
    const ledgerBefore = await PersistenceService.listLedger();
    const uri = await exportFile();

    await newPhone();
    await acceptDisclosure(true);
    const localSite = await seedSite({ alias: "Sitio del teléfono nuevo" });
    const device = (await SettingsService.load()).device;

    pick(uri);
    const preview = await previewBackupImport(PASS);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data!.summary).toMatchObject({ sessions: 1, sites: 2, packs: 1, unreadable: 0 });
    // La vista previa no escribe.
    expect((await PersistenceService.listSites({ includeArchived: true })).map((s) => s.id)).toEqual([localSite]);

    const r = await importAppBackup(preview.data!.token);
    expect(r.ok).toBe(true);

    const session = await PersistenceService.getSession(sessionId);
    expect(session?.bookkeeping.manualNote).toBe("Llave en la maceta");
    const after = await (await db()).getFirstAsync<{ manual_note_sealed: string }>("SELECT manual_note_sealed FROM sessions WHERE id = ?", [sessionId]);
    expect(after!.manual_note_sealed).toMatch(/^enc:v1:/);
    expect(after!.manual_note_sealed).not.toBe(before!.manual_note_sealed);
    const sites = await PersistenceService.listSites({ includeArchived: true });
    expect(sites.map((s) => s.alias).sort()).toEqual(["Sitio A", "Sitio B"]);
    expect(sites.find((s) => s.id === siteA)?.targetLat).not.toBeNull();

    const settings = await SettingsService.load();
    expect(settings.company.companyEmail).toBe("rrhh@empresa.test");
    expect(settings.profile.employeeName).toBe("Byron");
    expect(settings.device).toEqual(device); // alta y aviso aceptado son de este teléfono

    const ledger = await PersistenceService.listLedger();
    expect(ledger.slice(0, -1).map((e) => [e.id, e.hash])).toEqual(ledgerBefore.map((e) => [e.id, e.hash]));
    expect(ledger[ledger.length - 1]).toMatchObject({ intent: "BACKUP_RESTORED", prevHash: ledgerBefore[ledgerBefore.length - 1].hash });
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    expect(await ledgerDeleteBlocked()).toBe(true);

    const [pack] = await PersistenceService.listPacks();
    expect(pack.employeePdfUri).toBeNull(); // el PDF no viaja
    expect(pack.manifest.packHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("restaurar en el mismo teléfono conserva los PDF que siguen existiendo", async () => {
    await seedPhone();
    const uri = await exportFile();
    pick(uri);
    const preview = await previewBackupImport(PASS);
    expect(preview.ok).toBe(true);
    expect((await importAppBackup((preview.ok && preview.data!.token) as string)).ok).toBe(true);
    const [pack] = await PersistenceService.listPacks();
    expect(pack.employeePdfUri).not.toBeNull();
  });

  test("por el router: PREVIEW_BACKUP_IMPORT y IMPORT_BACKUP", async () => {
    await seedPhone();
    const uri = await exportFile();
    await newPhone();
    await acceptDisclosure(true);
    pick(uri);
    const preview = (await routeIntent({ type: "PREVIEW_BACKUP_IMPORT", passphrase: PASS })) as { ok: true; data: { token: string } };
    expect(preview.ok).toBe(true);
    expect(await routeIntent({ type: "IMPORT_BACKUP", token: preview.data.token })).toMatchObject({ ok: true });
    expect(await PersistenceService.listPacks()).toHaveLength(1);
  });
});

describe("copia de seguridad: validación (no escribe nada)", () => {
  test("contraseña equivocada", async () => {
    await seedPhone();
    const uri = await exportFile();
    pick(uri);
    expect(await previewBackupImport("otra contraseña")).toEqual({ ok: false, code: "BACKUP_WRONG_PASSWORD" });
  });

  test("cerrar el selector sin elegir", async () => {
    await seedWorld();
    expect(await previewBackupImport(PASS)).toEqual({ ok: false, code: "BACKUP_PICK_CANCELLED" });
  });

  test("archivo que no es una copia", async () => {
    await seedWorld();
    fs.__files.set("file:///tmp/dt/cache/x.dtbackup", "hola");
    pick("file:///tmp/dt/cache/x.dtbackup");
    expect(await previewBackupImport(PASS)).toEqual({ ok: false, code: "BACKUP_INVALID" });
  });

  test("esquema más nuevo, columna desconocida y jornada abierta en la copia", async () => {
    await seedPhone();
    const p = await payloadOf();
    expect(await validateBackupPayload({ ...p, data: { ...p.data, schemaVersion: 99 } })).toEqual({ ok: false, code: "BACKUP_NEWER_SCHEMA" });
    const extra = { ...p.data, tables: { ...p.data.tables, sessions: p.data.tables.sessions.map((s) => ({ ...s, "x; DROP TABLE sessions": 1 })) } };
    expect(await validateBackupPayload({ ...p, data: extra })).toEqual({ ok: false, code: "BACKUP_INVALID" });
    const open = { ...p.data, tables: { ...p.data.tables, sessions: p.data.tables.sessions.map((s) => ({ ...s, domain_status: "ACTIVA" })) } };
    expect(await validateBackupPayload({ ...p, data: open })).toEqual({ ok: false, code: "BACKUP_INVALID" });
  });

  test("cadena del libro rota → BACKUP_CHAIN_BROKEN", async () => {
    await seedPhone();
    const p = await payloadOf();
    const ledger = p.data.tables.ledger_entries.map((e, i) => (i === 1 ? { ...e, reason: "X", payload_json: String(e.payload_json).replace(/"reason":"[^"]*"/, '"reason":"X"') } : e));
    expect(await validateBackupPayload({ ...p, data: { ...p.data, tables: { ...p.data.tables, ledger_entries: ledger } } })).toEqual({ ok: false, code: "BACKUP_CHAIN_BROKEN" });
  });

  test("expediente que no coincide con su sello → BACKUP_PACK_INVALID", async () => {
    await seedPhone();
    const p = await payloadOf();
    const packs = p.data.tables.evidence_packs.map((row) => {
      const evidence = JSON.parse(String(row.evidence_json));
      return { ...row, evidence_json: JSON.stringify({ ...evidence, tampered: true }) };
    });
    expect(await validateBackupPayload({ ...p, data: { ...p.data, tables: { ...p.data.tables, evidence_packs: packs } } })).toEqual({ ok: false, code: "BACKUP_PACK_INVALID" });
  });

  test("una copia válida hecha a mano con el codec también pasa (formato estable)", async () => {
    await seedPhone();
    const text = await encryptBackup(JSON.stringify(await payloadOf()), PASS, { scrypt: { N: 2 ** 10, r: 8, p: 1 } });
    fs.__files.set("file:///tmp/dt/cache/manual.dtbackup", text);
    pick("file:///tmp/dt/cache/manual.dtbackup");
    expect((await previewBackupImport(PASS)).ok).toBe(true);
  });

  test("con PIN de administrador y zona bloqueada → ADMIN_LOCKED", async () => {
    await seedWorld();
    jest.spyOn(SecurityService, "hasPin").mockResolvedValue(true);
    expect(await previewBackupImport(PASS)).toEqual({ ok: false, code: "ADMIN_LOCKED" });
  });

  test("la revisión caduca a los 10 minutos", async () => {
    await seedPhone();
    pick(await exportFile());
    const preview = await previewBackupImport(PASS);
    time.travel(11 * 60_000);
    expect(await importAppBackup((preview.ok && preview.data!.token) as string)).toEqual({ ok: false, code: "BACKUP_EXPIRED" });
  });
});

describe("copia de seguridad: fallo a mitad → ROLLBACK", () => {
  async function phoneBState() {
    const d = await db();
    return {
      sessions: await d.getAllAsync("SELECT * FROM sessions ORDER BY id"),
      sites: await d.getAllAsync("SELECT * FROM sites ORDER BY id"),
      ledger: await d.getAllAsync("SELECT id, hash FROM ledger_entries ORDER BY id"),
      packs: await d.getAllAsync("SELECT id FROM evidence_packs"),
      company: await d.getFirstAsync("SELECT value_json FROM app_kv WHERE key = 'settings.company'"),
    };
  }

  async function prepare(): Promise<{ token: string; before: Awaited<ReturnType<typeof phoneBState>> }> {
    await seedPhone();
    const uri = await exportFile();
    await newPhone();
    // Teléfono B con sus propios datos.
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(2 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    pick(uri);
    const preview = await previewBackupImport(PASS);
    expect(preview.ok).toBe(true);
    return { token: (preview.ok && preview.data!.token) as string, before: await phoneBState() };
  }

  test("falla al cifrar una fila a mitad de las inserciones", async () => {
    const { token, before } = await prepare();
    const real = FieldCryptoService.encrypt.bind(FieldCryptoService);
    let calls = 0;
    jest.spyOn(FieldCryptoService, "encrypt").mockImplementation(async (...args) => {
      if (++calls === 3) throw new Error("fallo simulado");
      return real(...args);
    });
    expect(await importAppBackup(token)).toEqual({ ok: false, code: "BACKUP_RESTORE_FAILED" });
    expect(await phoneBState()).toEqual(before);
    expect(await ledgerDeleteBlocked()).toBe(true);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
  });

  test("falla el asiento BACKUP_RESTORED después de reemplazar todo", async () => {
    const { token, before } = await prepare();
    jest.spyOn(IntegrityLedgerService, "append").mockRejectedValueOnce(new Error("fallo simulado"));
    expect(await importAppBackup(token)).toEqual({ ok: false, code: "BACKUP_RESTORE_FAILED" });
    expect(await phoneBState()).toEqual(before);
    expect(await ledgerDeleteBlocked()).toBe(true);
  });
});
