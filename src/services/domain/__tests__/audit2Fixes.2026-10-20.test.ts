/**
 * Regresión de la auditoría 2 (2026-10-20). Un caso por hallazgo confirmado.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as MailComposer from "expo-mail-composer";
import { DEFAULT_COMPANY_POLICY, SettingsService } from "../../persistence/SettingsService";
import { KV_KEYS } from "../../persistence/schema";
import { PersistenceService } from "../../persistence/PersistenceService";
import { sweepPlaintext } from "../../persistence/cryptoMigrations";
import { ensureForeignKeys } from "../../persistence/foreignKeyMigration";
import { FieldCryptoService } from "../../persistence/FieldCryptoService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { ReportService } from "../../evidence/ReportService";
import { PayrollEngineService } from "../PayrollEngineService";
import { ConcurrencyGuardService } from "../ConcurrencyGuardService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { provisionAdminPin } from "../../application/useCases/provisionAdminPin";
import { createProvisionCode } from "../../runtime/pinProvision";
import { SecurityService } from "../../runtime/SecurityService";
import { COMPANY, HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { activeCorporateTimezone, getWeekEnd, getWeekStart, setCorporateTimezone, toDateString } from "../../../utils/dateUtils";

function codeFor(pin: string) {
  const made = createProvisionCode({
    pin,
    expiresAtMs: time.now() + 60_000,
    salt: randomBytes(16),
    nonce: randomBytes(16),
    seed: randomBytes(32),
  });
  if (!made.ok) throw new Error(made.code);
  return made.code;
}

async function closedPeriod() {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
  return { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
}

describe("auditoría 2 — 2026-10-20", () => {
  test("1: si insertPack falla, el asiento PAYROLL_SEALED no queda commiteado", async () => {
    const period = await closedPeriod();
    jest.spyOn(PersistenceService, "insertPack").mockRejectedValueOnce(new Error("disco"));
    const sealed = await EvidencePackService.seal(period);
    expect(sealed).toMatchObject({ ok: false, code: "PERSISTENCE_ERROR" });
    expect(await PersistenceService.listPacks()).toHaveLength(0);
    expect(await PersistenceService.listLedger({ intent: "PAYROLL_SEALED" })).toHaveLength(0);
    expect(await PersistenceService.listOffline()).toHaveLength(0);
    const again = await EvidencePackService.seal(period);
    expect(again.ok).toBe(true);
    if (again.ok) expect((await EvidencePackService.verify(again.data)).valid).toBe(true);
  });

  test("2: números imposibles se rechazan al guardar y no sobreviven a la carga", async () => {
    const current = await SettingsService.load();
    const rejected = await SettingsService.applyPatch(
      current,
      { company: { traceRetentionDays: -5, exitDebounceMs: 0, destinationLimit: 0, transitRateMultiplier: -3, exitDecisionWindowMs: -1 } },
      { adminUnlocked: true },
    );
    expect(rejected).toMatchObject({ ok: false, code: "INVALID_VALUE" });
    await expect(SettingsService.saveCompany({ ...current.company, traceRetentionDays: Number.NaN })).rejects.toThrow(/INVALID_COMPANY_POLICY/);
    await PersistenceService.setKv(KV_KEYS.COMPANY, {
      ...DEFAULT_COMPANY_POLICY,
      companyEmail: undefined,
      companyEmailSealed: null,
      traceRetentionDays: null,
      exitDebounceMs: 0,
      timezone: "Mars/Olympus",
    });
    const loaded = await SettingsService.load();
    expect(loaded.company.traceRetentionDays).toBe(DEFAULT_COMPANY_POLICY.traceRetentionDays);
    expect(loaded.company.exitDebounceMs).toBe(DEFAULT_COMPANY_POLICY.exitDebounceMs);
    expect(loaded.company.timezone).toBe("America/Los_Angeles");
  });

  test("3: la zona de la empresa cambia el día civil y la jornada guarda la suya", async () => {
    setCorporateTimezone("America/New_York");
    expect(toDateString("2026-01-15T07:30:00.000Z")).toBe("2026-01-15");
    setCorporateTimezone("America/Los_Angeles");
    expect(toDateString("2026-01-15T07:30:00.000Z")).toBe("2026-01-14");

    const { siteA } = await seedWorld();
    await SettingsService.saveCompany({ ...COMPANY, timezone: "America/New_York" });
    expect(activeCorporateTimezone()).toBe("America/New_York");
    time.set(Date.parse("2026-01-15T07:30:00.000Z"));
    const started = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(started.bookkeeping.recordedTimeZone).toBe("America/New_York");
    expect(started.bookkeeping.dateString).toBe("2026-01-15");
    await SettingsService.saveCompany({ ...COMPANY, timezone: "America/Los_Angeles" });
    const stored = await PersistenceService.getSession(started.id);
    expect(stored?.bookkeeping.recordedTimeZone).toBe("America/New_York");
    expect(stored?.bookkeeping.dateString).toBe("2026-01-15");
  });

  test("5: el barrido no marca done mientras quede un plain:v1 en el KV", async () => {
    const db = await PersistenceService.init();
    await FieldCryptoService.ensureMasterKey();
    await db.runAsync(
      `INSERT INTO spatial_facts (session_id, type, coords_sealed, source, reliable, timestamp_ms) VALUES (1, 'BREADCRUMB', ?, 'gps', 1, 1)`,
      ["plain:v1:{\"lat\":1,\"lon\":2}"],
    );
    await PersistenceService.setKv(KV_KEYS.COMPANY, { ...DEFAULT_COMPANY_POLICY, companyEmailSealed: "plain:v1:boss@example.com" });
    const first = await sweepPlaintext(1);
    expect(first.remaining).toBeGreaterThan(0);
    expect(await PersistenceService.getKv(KV_KEYS.CRYPTO_SWEEP)).toBeNull();
    const company = await PersistenceService.getKv<Record<string, unknown>>(KV_KEYS.COMPANY);
    expect(company?.companyEmailSealed).toBe("plain:v1:boss@example.com");
    const second = await sweepPlaintext(50);
    expect(second.remaining).toBe(0);
    expect(await PersistenceService.getKv(KV_KEYS.CRYPTO_SWEEP)).toBe("done");
    const after = await PersistenceService.getKv<Record<string, unknown>>(KV_KEYS.COMPANY);
    expect(String(after?.companyEmailSealed)).toMatch(/^enc:/);
  });

  test("12: soltar el candado no borra el lease de otro owner, y renovar tampoco lo pisa", async () => {
    await PersistenceService.init();
    const key = `${KV_KEYS.MUTEX_PREFIX}device`;
    await ConcurrencyGuardService.withLock("device", "UI", "sello", async () => {
      time.travel(20_000);
      expect(await ConcurrencyGuardService.renew("device")).toBe(true);
      const renewed = await ConcurrencyGuardService.peek("device");
      expect(renewed?.expiresAtMs).toBeGreaterThan(time.now());
      time.travel(31_000);
      await PersistenceService.setKv(key, { owner: "rt-other", origin: "WATCHDOG", label: "headless", expiresAtMs: time.now() + 60_000 });
      expect(await ConcurrencyGuardService.renew("device")).toBe(false);
    });
    const left = await PersistenceService.getKv<{ owner: string }>(key);
    expect(left?.owner).toBe("rt-other");
  });

  test("13: cancelar el compositor no es un envío", async () => {
    jest.spyOn(MailComposer, "composeAsync").mockResolvedValue({ status: "cancelled" } as Awaited<ReturnType<typeof MailComposer.composeAsync>>);
    expect(await ReportService.email(["file://pack.pdf"], "boss@example.com", "Ada", "W1")).toBe(false);
  });

  test("14: si el ledger falla, el PIN y el nonce quedan como estaban", async () => {
    const code = codeFor("481236");
    jest.spyOn(IntegrityLedgerService, "append").mockRejectedValueOnce(new Error("ledger"));
    const failed = await provisionAdminPin(code);
    expect(failed).toMatchObject({ ok: false, code: "PERSISTENCE_ERROR" });
    expect(await SecurityService.pinOrigin()).toBe("UNSET");
    expect(await PersistenceService.listLedger({ intent: "ADMIN_PIN_PROVISIONED" })).toHaveLength(0);
    const again = await provisionAdminPin(code);
    expect(again.ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("EMPLOYER");
  }, 20_000);

  test("15: la migración conserva la jornada, aparta el huérfano y el pragma rechaza otro", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    const db = await PersistenceService.init();
    await db.execAsync("PRAGMA foreign_keys = OFF");
    await db.runAsync(`INSERT INTO spatial_facts (session_id, type, source, reliable, timestamp_ms) VALUES (999999, 'ENTER', 'gps', 1, 1)`);
    await db.runAsync(`UPDATE sessions SET site_id = 999999 WHERE id = ?`, [session.id]);
    const report = await ensureForeignKeys(db, { force: true });
    expect(report.spatialSession).toBe(1);
    expect(report.sessionSite).toBe(1);
    const kept = await PersistenceService.getSession(session.id);
    expect(kept?.id).toBe(session.id);
    expect(kept?.siteId).toBeNull();
    const parked = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM spatial_facts_orphans`);
    expect(parked?.n).toBe(1);
    const fks = await db.getAllAsync<{ from?: string }>(`PRAGMA foreign_key_list(spatial_facts)`);
    expect(fks.some((row) => row.from === "session_id")).toBe(true);
    await db.execAsync("PRAGMA foreign_keys = ON");
    await expect(
      db.runAsync(`INSERT INTO spatial_facts (session_id, type, source, reliable, timestamp_ms) VALUES (999999, 'ENTER', 'gps', 1, 2)`),
    ).rejects.toThrow();
  });

  test("16: un estado desconocido no se cobra y queda en cuarentena con asiento", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    const db = await PersistenceService.init();
    await db.runAsync(`UPDATE sessions SET domain_status = 'NO_SUCH' WHERE id = ?`, [session.id]);
    const read = await PersistenceService.getSession(session.id);
    expect(read?.domainStatus).toBe("CUARENTENA");
    expect(await PersistenceService.getOpenSession()).toBeNull();
    const ledger = await PersistenceService.listLedger({ intent: "SESSION_QUARANTINED" });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].payloadJson).toContain("NO_SUCH");
    const statement = PayrollEngineService.buildStatement({
      periodStart: getWeekStart(time.now()),
      periodEnd: getWeekEnd(time.now()),
      sessions: [read!],
      rates: { hourlyRate: 20, overtimeMultiplier: 1.5 },
      company: COMPANY,
      policyId: COMPANY.overtimePolicyId,
      nowMs: time.now() + 3 * HOUR,
    });
    expect(statement.sessionIds).not.toContain(session.id);
    expect(statement.grossEstimate).toBe(0);
    expect(statement.warnings).toContain("QUARANTINED_SESSION_EXCLUDED");
  });

  test("10: el PIN de la CLI no viaja en argv cuando se lee de un archivo", () => {
    const dir = mkdtempSync(join(tmpdir(), "dt-pin-"));
    const pinFile = join(dir, "pin.txt");
    const keyFile = join(dir, "employer-key.json");
    writeFileSync(pinFile, "918273\n", { mode: 0o600 });
    const ran = spawnSync("npx", ["--yes", "tsx", "scripts/provision-admin-pin.ts", "--pin-file", pinFile, "--key", keyFile, "--hours", "1"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DT_PIN: "" },
    });
    expect(ran.status).toBe(0);
    expect(ran.stdout.startsWith("DTPIN1.")).toBe(true);
    expect(ran.stdout.includes("918273")).toBe(false);
    expect(ran.stderr.includes("918273")).toBe(false);
    expect(ran.stdout.includes("--pin")).toBe(false);

    const warned = spawnSync(
      "npx",
      ["--yes", "tsx", "scripts/provision-admin-pin.ts", "--pin", "918273", "--key", keyFile, "--hours", "1"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(warned.status).toBe(0);
    expect(warned.stderr).toMatch(/desuso/);
    expect(warned.stdout.includes("918273")).toBe(false);
  });
});
