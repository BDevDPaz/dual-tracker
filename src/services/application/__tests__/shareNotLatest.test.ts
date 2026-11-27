/**
 * Solicitud 8 · D4 (respaldo en el router): compartir un pack que no es el
 * último de su periodo exige `confirmNotLatest`; si no, NOT_LATEST_UNCONFIRMED
 * y no se comparte nada. El último se comparte sin confirmar. «Enviar por
 * correo» (ensureFresh) no cambia.
 */
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import type { EvidencePack } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PersistenceService } from "../../persistence/PersistenceService";
import { routeIntent } from "../intentRouter";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const mail = MailComposer as unknown as { __sent: unknown[] };
const sharing = Sharing as unknown as { __shared: string[] };

beforeEach(() => {
  mail.__sent.length = 0;
  sharing.__shared.length = 0;
});

/** Dos packs del mismo periodo: `older` sellado antes que `latest`. */
async function twoPacks() {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  const periodStart = getWeekStart(time.now());
  const periodEnd = getWeekEnd(time.now());
  const first = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd });
  if (!first.ok) throw new Error(String(first.code));
  time.travel(MIN);
  const second = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd, reissue: true });
  if (!second.ok) throw new Error(String(second.code));
  return { older: first.data as EvidencePack, latest: second.data as EvidencePack };
}

async function sharedPackIds(): Promise<string[]> {
  return (await PersistenceService.listLedger({ intent: "PACK_SHARED" })).map((e) => (JSON.parse(e.payloadJson) as { data: { packId: string } }).data.packId);
}

describe("D4 · router: NOT_LATEST_UNCONFIRMED", () => {
  test.each(["SHARE_EMPLOYEE", "SHARE_EMPLOYER"] as const)("%s de un pack que no es el último sin confirmar se rechaza y no comparte", async (type) => {
    const { older, latest } = await twoPacks();
    const r = await routeIntent({ type, packId: older.id });
    expect(r).toMatchObject({ ok: false, code: "NOT_LATEST_UNCONFIRMED", detail: latest.id });
    expect(sharing.__shared).toHaveLength(0);
    expect(mail.__sent).toHaveLength(0);
    expect(await sharedPackIds()).toEqual([]);
  });

  test.each(["SHARE_EMPLOYEE", "SHARE_EMPLOYER"] as const)("%s con confirmNotLatest comparte el pack elegido", async (type) => {
    const { older } = await twoPacks();
    expect(await routeIntent({ type, packId: older.id, confirmNotLatest: true })).toMatchObject({ ok: true });
    expect(await sharedPackIds()).toEqual([older.id]);
  });

  test.each(["SHARE_EMPLOYEE", "SHARE_EMPLOYER"] as const)("%s del último pack no pide confirmación", async (type) => {
    const { latest } = await twoPacks();
    expect(await routeIntent({ type, packId: latest.id })).toMatchObject({ ok: true });
    expect(await sharedPackIds()).toEqual([latest.id]);
  });

  test("SHARE_EMPLOYER con ensureFresh no pasa por la confirmación: envía el pack vigente", async () => {
    const { older, latest } = await twoPacks();
    const r = await routeIntent({ type: "SHARE_EMPLOYER", packId: older.id, ensureFresh: true });
    expect(r).toMatchObject({ ok: true, data: { id: latest.id } });
    expect(await sharedPackIds()).toEqual([latest.id]);
  });

  test("un pack inexistente sigue dando PACK_NOT_FOUND", async () => {
    await twoPacks();
    expect(await routeIntent({ type: "SHARE_EMPLOYEE", packId: "W-no-existe" })).toMatchObject({ ok: false, code: "PACK_NOT_FOUND" });
  });
});
