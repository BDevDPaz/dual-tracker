/**
 * Solicitud 8 · D6: «último pack del periodo» con desempate determinista.
 * createdAtMs descendente; si empatan, id ascendente. Da igual el orden de entrada.
 */
import { compareNewestPackFirst, latestPeriodPack, termsForPeriod } from "../payrollTerms";
import { policyForPeriod } from "../PayrollEngineService";

const tied = [
  { id: "W2026-11-23-bbbbbbbb", periodStart: 1, periodEnd: 2, policyId: "B", createdAtMs: 100 },
  { id: "W2026-11-23-aaaaaaaa", periodStart: 1, periodEnd: 2, policyId: "A", createdAtMs: 100 },
];
const company = { overtimeMultiplier: 1.5, payrollLegalFlags: { caDoubleTime: false, caSeventhDay: false, transitionWeeklyThreshold: "FULL" } } as never;

describe("D6 · desempate por id", () => {
  test("mismo createdAtMs: gana el id menor, sea cual sea el orden de entrada", () => {
    expect(latestPeriodPack(tied, 1, 2)?.id).toBe("W2026-11-23-aaaaaaaa");
    expect(latestPeriodPack([...tied].reverse(), 1, 2)?.id).toBe("W2026-11-23-aaaaaaaa");
  });

  test("createdAtMs mayor sigue ganando aunque su id sea mayor", () => {
    const packs = [
      { id: "a", periodStart: 1, periodEnd: 2, policyId: "OLD", createdAtMs: 10 },
      { id: "z", periodStart: 1, periodEnd: 2, policyId: "NEW", createdAtMs: 20 },
    ];
    expect(latestPeriodPack(packs, 1, 2)?.id).toBe("z");
    expect(latestPeriodPack([...packs].reverse(), 1, 2)?.id).toBe("z");
    expect(compareNewestPackFirst(packs[1]!, packs[0]!)).toBeLessThan(0);
  });

  test("policyForPeriod y termsForPeriod usan el mismo ganador en un empate", () => {
    expect(policyForPeriod(tied, 1, 2, "CURRENT")).toBe("A");
    expect(policyForPeriod([...tied].reverse(), 1, 2, "CURRENT")).toBe("A");
    const terms = (id: string) => ({ overtimeMultiplier: id === "A" ? 2 : 3, payrollLegalFlags: { caDoubleTime: false, caSeventhDay: false, transitionWeeklyThreshold: "FULL" } });
    const withTerms = tied.map((p) => ({ ...p, payrollTerms: terms(p.policyId) }));
    const a = termsForPeriod(withTerms, 1, 2, company);
    const b = termsForPeriod([...withTerms].reverse(), 1, 2, company);
    expect(a).toMatchObject({ source: "PACK", terms: { overtimeMultiplier: 2 } });
    expect(b).toEqual(a);
  });
});
