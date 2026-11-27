/**
 * Solicitud 8 · D6: dos packs del mismo periodo sellados en el mismo
 * milisegundo. latestPackFor, packBasisForPeriod (SQL) y el selector de la
 * pantalla eligen el mismo: createdAtMs descendente y, si empatan, id ascendente.
 */
import type { EvidencePack } from "../../../core/contracts";
import { selectLatestPackForPeriod } from "../../../core/selectors";
import { routeIntent } from "../../application/intentRouter";
import { latestPackFor } from "../EvidencePackService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

/** Dos packs del mismo periodo con el mismo createdAtMs. El insertado después recibe el id menor. */
async function tiedPacks() {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  const periodStart = getWeekStart(time.now());
  const periodEnd = getWeekEnd(time.now());
  const first = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd });
  if (!first.ok) throw new Error(String(first.code));
  // Reloj congelado: la reemisión sella en el mismo milisegundo.
  const second = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd, reissue: true });
  if (!second.ok) throw new Error(String(second.code));
  const a = first.data as EvidencePack;
  const b = second.data as EvidencePack;
  expect(b.createdAtMs).toBe(a.createdAtMs);
  const db = await PersistenceService.init();
  // Ids fijos para que el resultado no dependa del sufijo aleatorio: el primero insertado queda con el id mayor.
  // offline_queue apunta a evidence_packs(id): se renombra en ambas con las FK apagadas.
  await db.execAsync("PRAGMA foreign_keys = OFF");
  for (const [from, to, policy] of [[a.id, "W-zzzz", "POLICY-Z"], [b.id, "W-aaaa", "POLICY-A"]] as const) {
    await db.runAsync("UPDATE evidence_packs SET id = ?, policy_id = ? WHERE id = ?", [to, policy, from]);
    await db.runAsync("UPDATE offline_queue SET pack_id = ? WHERE pack_id = ?", [to, from]);
  }
  await db.execAsync("PRAGMA foreign_keys = ON");
  return { periodStart, periodEnd };
}

describe("D6 · empate en createdAtMs", () => {
  test("latestPackFor y packBasisForPeriod devuelven el pack de id menor", async () => {
    const { periodStart, periodEnd } = await tiedPacks();
    expect((await latestPackFor(periodStart, periodEnd))?.id).toBe("W-aaaa");
    expect((await PersistenceService.packBasisForPeriod(periodStart, periodEnd))?.policyId).toBe("POLICY-A");
  });

  test("el selector de pantalla elige el mismo, sea cual sea el orden del store", async () => {
    const { periodStart, periodEnd } = await tiedPacks();
    const packs = (await PersistenceService.listPacks()).filter((p) => p.manifest.periodStart === periodStart);
    expect(packs.map((p) => p.id).sort()).toEqual(["W-aaaa", "W-zzzz"]);
    for (const order of [packs, [...packs].reverse()]) {
      const state = { packs: { order: order.map((p) => p.id), byId: Object.fromEntries(order.map((p) => [p.id, p])) } } as never;
      expect(selectLatestPackForPeriod(state, periodStart, periodEnd)?.id).toBe("W-aaaa");
    }
  });
});
