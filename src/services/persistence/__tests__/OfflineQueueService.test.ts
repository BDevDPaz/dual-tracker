/** Cola del portal: sin URL no hay fetch; 2xx/409 cierran; 5xx espera y reintenta. */
import type { EvidencePack } from "../../../core/contracts";
import { PORTAL_BACKOFF_BASE_MS } from "../../../config/provisional";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { time } from "../../../../test/time";
import { __setPortalFetchForTests } from "../employerPortal";
import { OfflineQueueService } from "../OfflineQueueService";
import { PersistenceService } from "../PersistenceService";
import { DEFAULT_COMPANY_POLICY, SettingsService } from "../SettingsService";

const HASH = "ab".repeat(32);

function pack(id = "P1"): EvidencePack {
  return {
    id,
    manifest: {
      packId: id,
      periodStart: 1,
      periodEnd: 2,
      sealedAtMs: 3,
      policyId: "CA_DAILY8_WEEKLY40_v1",
      sessionIds: [1],
      statementHash: "cd".repeat(32),
      evidenceHash: "ef".repeat(32),
      packHash: HASH,
      certified: true,
      files: [],
    },
    statement: makeStatement(),
    evidence: makeEvidence(),
    employeePdfUri: null,
    employerPdfUri: null,
    manifestUri: null,
    createdAtMs: 3,
  };
}

async function arm(url: string | null, enabled: boolean) {
  await SettingsService.saveCompany({
    ...DEFAULT_COMPANY_POLICY,
    employerPortalEnabled: enabled,
    employerPortalUrl: url,
  });
}

describe("OfflineQueueService", () => {
  let calls: { url: string; init: { headers: Record<string, string>; body: string } }[];

  beforeEach(async () => {
    await PersistenceService.init();
    calls = [];
    __setPortalFetchForTests(async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    });
  });

  afterEach(() => __setPortalFetchForTests(null));

  test("sin URL, apagado o http: flush no llama a fetch", async () => {
    await PersistenceService.insertPack(pack());
    await OfflineQueueService.enqueue("P1", HASH);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 0, synced: 0, skipped: "NOT_CONFIGURED" });

    await arm("https://portal.example/in", false);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 0, synced: 0, skipped: "DISABLED" });

    await arm("http://portal.example/in", true);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 0, synced: 0, skipped: "NOT_HTTPS" });
    expect(calls).toHaveLength(0);
  });

  test("POST firmado: Idempotency-Key = packHash y 2xx marca SYNCED", async () => {
    await PersistenceService.insertPack(pack());
    await OfflineQueueService.enqueue("P1", HASH);
    await arm("https://portal.example/in", true);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 1, synced: 1, skipped: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://portal.example/in");
    expect(calls[0].init.headers["Idempotency-Key"]).toBe(HASH);
    expect(JSON.parse(calls[0].init.body).manifest.packHash).toBe(HASH);
    expect(calls[0].init.body).not.toContain("targetLat");
    expect((await OfflineQueueService.list())[0].status).toBe("SYNCED");
  });

  test("409 cuenta como ya recibido", async () => {
    __setPortalFetchForTests(async () => ({ ok: false, status: 409 }));
    await PersistenceService.insertPack(pack());
    await OfflineQueueService.enqueue("P1", HASH);
    await arm("https://portal.example/in", true);
    expect(await OfflineQueueService.flush()).toMatchObject({ attempted: 1, synced: 1 });
    expect((await OfflineQueueService.list())[0].status).toBe("SYNCED");
  });

  test("500 espera el backoff y el siguiente flush envía", async () => {
    let n = 0;
    __setPortalFetchForTests(async () => {
      n += 1;
      return n === 1 ? { ok: false, status: 500 } : { ok: true, status: 200 };
    });
    await PersistenceService.insertPack(pack());
    await OfflineQueueService.enqueue("P1", HASH);
    await arm("https://portal.example/in", true);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 1, synced: 0, skipped: null });
    expect((await OfflineQueueService.list())[0]).toMatchObject({ status: "FAILED", lastError: "HTTP_500" });
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 0, synced: 0, skipped: null });
    time.travel(PORTAL_BACKOFF_BASE_MS);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 1, synced: 1, skipped: null });
    expect((await OfflineQueueService.list())[0].status).toBe("SYNCED");
  });

  test("expediente ausente queda FAILED y no llama a fetch", async () => {
    await OfflineQueueService.enqueue("NOPE", HASH);
    await arm("https://portal.example/in", true);
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 1, synced: 0, skipped: null });
    expect(calls).toHaveLength(0);
    expect((await OfflineQueueService.list())[0]).toMatchObject({ status: "FAILED", lastError: "PACK_MISSING" });
  });
});
