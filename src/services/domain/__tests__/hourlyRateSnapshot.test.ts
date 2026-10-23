/**
 * Tarifa por hora congelada en cada jornada (schema v8, hourly_rate_snapshot).
 * Migración, cálculo con tarifas distintas por jornada, respaldo para jornadas
 * antiguas, tarifa 0 nunca silenciosa y registro en el ledger del cambio de tarifa.
 */
import type { SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PayrollEngineService, sessionRates } from "../PayrollEngineService";
import { transition } from "../sessionMachine";
import { rowToSession, sessionToParams, SESSION_COLUMNS } from "../../persistence/mappers";
import type { DbSessionRow } from "../../persistence/mappers";
import { CREATE_TABLES_SQL, DB_NAME, KV_KEYS, SCHEMA_VERSION, SESSION_V8_COLUMNS } from "../../persistence/schema";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { StoreActions } from "../../../core/store";
import { routeIntent } from "../../application/intentRouter";
import { SecurityService } from "../../runtime/SecurityService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { COMPANY, CA_POLICY_ID, HOUR, MONDAY_8AM, RATES, makeClosedSession, makeCtx } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const DAY = 24 * HOUR;
const withRate = (s: SessionRecord, rate: number): SessionRecord => ({ ...s, bookkeeping: { ...s.bookkeeping, hourlyRateSnapshot: rate } });
function statement(sessions: SessionRecord[]) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    sessions,
    rates: RATES,
    company: COMPANY,
    policyId: CA_POLICY_ID,
    nowMs: MONDAY_8AM + 7 * DAY,
  });
}

describe("schema v9 — migración", () => {
  test("versión 9 y columnas en el CREATE TABLE", () => {
    expect(SCHEMA_VERSION).toBe(9);
    expect(SESSION_V8_COLUMNS).toEqual([["hourly_rate_snapshot", "REAL"]]);
    expect(CREATE_TABLES_SQL).toMatch(/hourly_rate_snapshot REAL/);
    expect(CREATE_TABLES_SQL).toMatch(/compliance_json TEXT/);
    expect(SESSION_COLUMNS).toContain("hourly_rate_snapshot");
    expect(SESSION_COLUMNS).toContain("compliance_json");
  });

  test("una base v7 (sin las columnas nuevas) gana hourly_rate_snapshot y compliance_json y guarda schema 9", async () => {
    await jest.isolateModulesAsync(async () => {
      const sqlite = require("expo-sqlite") as typeof import("../../../../test/mocks/expo-sqlite");
      const legacySql = CREATE_TABLES_SQL.replace(/,\s*hourly_rate_snapshot REAL/, "").replace(/,\s*compliance_json TEXT/, "");
      expect(legacySql).not.toMatch(/hourly_rate_snapshot/);
      expect(legacySql).not.toMatch(/compliance_json/);
      const raw = await sqlite.openDatabaseAsync(DB_NAME);
      await raw.execAsync(legacySql);
      const cols = async () => (await raw.getAllAsync<{ name: string }>(`PRAGMA table_info(sessions)`)).map((c) => c.name);
      expect(await cols()).not.toContain("hourly_rate_snapshot");
      expect(await cols()).not.toContain("compliance_json");

      const { PersistenceService: PS } = require("../../persistence/PersistenceService") as typeof import("../../persistence/PersistenceService");
      await PS.init();
      expect(await cols()).toContain("hourly_rate_snapshot");
      expect(await cols()).toContain("compliance_json");
      const kv = await raw.getFirstAsync<{ value: string }>(`SELECT value_json AS value FROM app_kv WHERE key = ?`, [KV_KEYS.SCHEMA_VERSION]);
      expect(JSON.parse(kv!.value)).toBe(9);
    });
  });
});

describe("mappers — hourlyRateSnapshot", () => {
  test("ida y vuelta con tarifa; NULL o inválida → ausente (jornada antigua)", async () => {
    const s = withRate(makeClosedSession(MONDAY_8AM, 8), 27.5);
    const params = sessionToParams(s, null);
    expect(params[SESSION_COLUMNS.indexOf("hourly_rate_snapshot")]).toBe(27.5);
    const row = Object.fromEntries(SESSION_COLUMNS.map((c, i) => [c, params[i]])) as unknown as DbSessionRow;
    expect((await rowToSession({ ...row, id: 1 } as DbSessionRow)).bookkeeping.hourlyRateSnapshot).toBe(27.5);
    for (const bad of [null, -1, Number.NaN]) {
      const r = await rowToSession({ ...row, id: 1, hourly_rate_snapshot: bad } as DbSessionRow);
      expect("hourlyRateSnapshot" in r.bookkeeping).toBe(false);
    }
    expect(sessionToParams(makeClosedSession(MONDAY_8AM, 8), null)[SESSION_COLUMNS.indexOf("hourly_rate_snapshot")]).toBeNull();
  });
});

describe("sessionMachine — START_DAY congela la tarifa", () => {
  test("guarda ctx.hourlyRate y la omite si no llega", () => {
    const a = transition(null, { type: "START_DAY", siteId: 1 }, makeCtx({ hourlyRate: 31 }));
    expect(a.ok && a.next.bookkeeping.hourlyRateSnapshot).toBe(31);
    const b = transition(null, { type: "START_DAY", siteId: 1 }, makeCtx());
    expect(b.ok && "hourlyRateSnapshot" in b.next.bookkeeping).toBe(false);
  });
});

describe("PayrollEngine — tarifa por jornada", () => {
  test("dos jornadas el mismo día con tarifas distintas: cada una usa la suya", () => {
    const s1 = withRate(makeClosedSession(MONDAY_8AM, 3, { id: 1 }), 20);
    const s2 = withRate(makeClosedSession(MONDAY_8AM + 4 * HOUR, 3, { id: 2 }), 30);
    const st = statement([s1, s2]);
    const reg = (id: number) => st.lines.filter((l) => l.sessionId === id && l.kind === "REGULAR");
    expect(reg(1).every((l) => l.rate === 20)).toBe(true);
    expect(reg(2).every((l) => l.rate === 30)).toBe(true);
    expect(st.grossEstimate).toBe(3 * 20 + 3 * 30 + 25);
    expect(st.warnings.some((w) => w.startsWith("RATE_FALLBACK_CURRENT"))).toBe(false);
  });

  test("el OT de una jornada usa su propia tarifa congelada", () => {
    const st = statement([withRate(makeClosedSession(MONDAY_8AM, 9, { id: 1 }), 40)]);
    expect(st.grossEstimate).toBe(8 * 40 + 1 * 60 + 40);
  });

  test("jornada antigua sin tarifa → tarifa actual + RATE_FALLBACK_CURRENT", () => {
    const old = makeClosedSession(MONDAY_8AM, 8, { id: 7 });
    expect(sessionRates(old, RATES)).toEqual({ rates: RATES, fallback: true });
    const st = statement([old, withRate(makeClosedSession(MONDAY_8AM + DAY, 8, { id: 8 }), 25)]);
    expect(st.grossEstimate).toBe(8 * 20 + 8 * 25 + 20 + 25);
    expect(st.warnings).toContain("RATE_FALLBACK_CURRENT#7");
    expect(st.warnings).not.toContain("RATE_FALLBACK_CURRENT#8");
  });

  test("tarifa 0 nunca pasa en silencio", () => {
    const st = statement([withRate(makeClosedSession(MONDAY_8AM, 8, { id: 3 }), 0)]);
    expect(st.grossEstimate).toBe(0);
    expect(st.warnings).toContain("HOURLY_RATE_ZERO#3");
  });

  test("previewSession usa la tarifa congelada", () => {
    const p = PayrollEngineService.previewSession(withRate(makeClosedSession(MONDAY_8AM, 8), 50), RATES, COMPANY, MONDAY_8AM + DAY)!;
    expect(p.grossEstimate).toBe(8 * 50 + 50);
  });
});

describe("flujo — START_DAY real y cambio de tarifa con PIN", () => {
  test("la jornada guarda la tarifa vigente; el cambio posterior no la altera y queda en el ledger", async () => {
    await PersistenceService.init();
    const { siteA } = await seedWorld();
    const settings = await SettingsService.load();
    await SettingsService.saveProfile({ ...settings.profile, hourlyRate: 22 });
    StoreActions.settingsReplaced(await SettingsService.load());

    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect((await PersistenceService.getSession(s.id))!.bookkeeping.hourlyRateSnapshot).toBe(22);

    // La zona admin exige PIN desbloqueado (intentRouter → ADMIN_LOCKED si no).
    expect((await SecurityService.setPin("123456")).ok).toBe(true);
    const before = time.now();
    expect((await SecurityService.unlock("123456")).ok).toBe(true);
    const r = await routeIntent({ type: "SAVE_SETTINGS", patch: { profile: { hourlyRate: 35 } } });
    expect(r.ok).toBe(true);
    expect((await SettingsService.load()).profile.hourlyRate).toBe(35);
    expect((await PersistenceService.getSession(s.id))!.bookkeeping.hourlyRateSnapshot).toBe(22);

    const entries = await IntegrityLedgerService.listForPeriod(before - 1, time.now() + 1);
    const change = entries.find((e) => e.intent === "HOURLY_RATE_CHANGED");
    expect(change).toBeDefined();
    expect(JSON.parse(change!.payloadJson).data).toMatchObject({ from: 22, to: 35 });
  });
});
