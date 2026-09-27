/** T0 — humo (Propuesta de calidad §8): sessionMachine, HashChain, geoUtils. */
import { transition } from "../../services/domain/sessionMachine";
import { sha256Hex } from "../../services/evidence/HashChain";
import { getDistanceFromLatLonInMeters } from "../../utils/geoUtils";
import { makeCtx } from "../../../test/fixtures/session.fixture";
import { FIXED_EPOCH_ISO, time } from "../../../test/time";

describe("T0 smoke", () => {
  test("sessionMachine importable y puro bajo el reloj fijo UTC", () => {
    expect(process.env.TZ).toBe("UTC");
    expect(new Date(time.now()).toISOString()).toBe(FIXED_EPOCH_ISO);
    const r = transition(null, { type: "START_DAY", siteId: 1 }, makeCtx(), null);
    expect(r.ok && r.next.domainStatus).toBe("ESPERANDO");
  });

  test("HashChain: SHA-256 real vía doble de expo-crypto", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("geoUtils: Haversine ~111 km por grado de latitud", () => {
    expect(getDistanceFromLatLonInMeters(0, 0, 1, 0)).toBeCloseTo(111_195, -1);
  });
});
