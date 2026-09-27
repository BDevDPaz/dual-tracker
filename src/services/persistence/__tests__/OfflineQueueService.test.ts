/** T4 — OfflineQueue: sin transporte no hace nada; fallos quedan FAILED y se reintentan. */
import { OfflineQueueService } from "../OfflineQueueService";
import { PersistenceService } from "../PersistenceService";

describe("OfflineQueueService", () => {
  beforeEach(() => PersistenceService.init());
  afterEach(() => OfflineQueueService.setTransport(null));

  test("sin transporte configurado: flush no intenta nada", async () => {
    await OfflineQueueService.enqueue("P1");
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 0, synced: 0 });
  });

  test("fallo → FAILED; reintento exitoso → SYNCED", async () => {
    await OfflineQueueService.enqueue("P1");
    OfflineQueueService.setTransport(async () => {
      throw new Error("offline");
    });
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 1, synced: 0 });
    expect((await OfflineQueueService.list())[0].status).toBe("FAILED");
    OfflineQueueService.setTransport(async () => {});
    expect(await OfflineQueueService.flush()).toEqual({ attempted: 1, synced: 1 });
    expect((await OfflineQueueService.list())[0].status).toBe("SYNCED");
  });
});
