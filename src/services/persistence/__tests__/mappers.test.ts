/** T4 — schema.ts y mappers.ts como funciones puras. */
import { CREATE_TABLES_SQL, KV_KEYS, SCHEMA_VERSION } from "../schema";
import { SESSION_COLUMNS, mapLegacyStatus, repairDateString, rowToSession, rowToSite, sessionToParams } from "../mappers";
import type { DbSessionRow } from "../mappers";
import { MONDAY_8AM, makeClosedSession } from "../../../../test/fixtures/session.fixture";

describe("schema", () => {
  test("define tablas núcleo y triggers append-only del ledger", () => {
    for (const t of ["sessions", "sites", "ledger_entries", "spatial_facts", "app_kv", "evidence_packs", "offline_queue"]) {
      expect(CREATE_TABLES_SQL).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`));
    }
    expect(CREATE_TABLES_SQL).toMatch(/BEFORE UPDATE ON ledger_entries/);
    expect(CREATE_TABLES_SQL).toMatch(/BEFORE DELETE ON ledger_entries/);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    expect(KV_KEYS.MUTEX_PREFIX).toBe("mutex.");
  });
});

describe("mappers", () => {
  test("mapLegacyStatus traduce el vocabulario GEOTrack/LEDTracker", () => {
    expect(mapLegacyStatus("GEOFENCE_CREATED")).toBe("ESPERANDO");
    expect(mapLegacyStatus("ACTIVE_WORK")).toBe("ACTIVA");
    expect(mapLegacyStatus("PAUSED")).toBe("PAUSADA");
    expect(mapLegacyStatus("travel")).toBe("TRASLADO");
    expect(mapLegacyStatus("PENDING_EXIT_CONFIRMATION")).toBe("SALIDA");
    expect(mapLegacyStatus("completed")).toBe("CERRADA");
    expect(mapLegacyStatus(undefined)).toBe("CUARENTENA");
    expect(mapLegacyStatus("NO_SUCH")).toBe("CUARENTENA");
    expect(mapLegacyStatus("ACTIVE")).toBe("CUARENTENA");
  });

  test("repairDateString repara 'Invalid Date' desde el inicio", () => {
    expect(repairDateString("2026-09-21", MONDAY_8AM)).toBe("2026-09-21");
    expect(repairDateString("Invalid Date", MONDAY_8AM)).toBe("2026-09-21");
    expect(repairDateString(null, null)).toBe("");
  });

  test("sessionToParams ↔ rowToSession es ida y vuelta", async () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { id: 7 });
    const params = sessionToParams(s, null);
    const cols = SESSION_COLUMNS as readonly string[];
    expect(params).toHaveLength(cols.length);
    const row = Object.fromEntries(cols.map((c, i) => [c, params[i]])) as unknown as DbSessionRow;
    expect(await rowToSession({ ...row, id: 7 })).toEqual(s);
  });

  test("rowToSession tolera timestamps TEXT y clase de integridad desconocida (→ CONFLICT)", async () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { id: 3 });
    const params = sessionToParams(s, null);
    const row = Object.fromEntries((SESSION_COLUMNS as readonly string[]).map((c, i) => [c, params[i]])) as unknown as Record<string, unknown>;
    const weird = { ...row, id: 3, declared_start_ms: String(MONDAY_8AM), integrity_class: "???", date_string: "Invalid Date", domain_status: "ACTIVE_WORK" };
    const out = await rowToSession(weird as unknown as DbSessionRow);
    expect(out.declaredStartAtMs).toBe(MONDAY_8AM);
    expect(out.integrityClass).toBe("CONFLICT");
    expect(out.bookkeeping.dateString).toBe("2026-09-21");
    expect(out.domainStatus).toBe("ACTIVA");
  });

  test("rowToSite mapea booleanos y nulos", async () => {
    const site = await rowToSite({ id: 1, alias: "A", address: "x", client_name: null, notes: null, target_lat: 1, target_lon: 2, radius_m: null, active: 0, created_at_ms: MONDAY_8AM, archived_at_ms: MONDAY_8AM + 1000 } as Parameters<typeof rowToSite>[0]);
    expect(site).toMatchObject({ id: 1, active: false, radiusM: null, createdAtMs: MONDAY_8AM, archivedAtMs: MONDAY_8AM + 1000 });
  });
});
