/**
 * Términos de nómina congelados por periodo (manifiesto v6, decisión de Byron
 * del 2026-11-26): al resellar o reemitir un periodo que ya tiene expediente,
 * el multiplicador OT y las banderas legales son los del pack previo, igual
 * que la política (spec v1.3 §5.2 N3, `policyForPeriod`). Las semanas sin
 * sellar usan los vigentes. Un pack v1–v5 no trae términos: se usan los
 * vigentes y la pantalla avisa («términos no congelados»).
 *
 * Puro: sin E/S. El pack previo es el más reciente del periodo exacto
 * (mismo criterio que policyForPeriod y PersistenceService.packPolicyForPeriod).
 */
import type { CompanyPolicy, PayrollLegalFlags, PayrollTerms } from "../../core/contracts";
import { legalFlags } from "../../utils/companyPolicy";

/** Origen de los términos de un periodo. */
export type PayrollTermsSource =
  /** Sin pack en el periodo: términos vigentes (semana sin sellar). */
  | "CURRENT"
  /** Términos congelados del pack previo (v6). */
  | "PACK"
  /** Hay pack, pero es v1–v5 (o sus términos no son legibles): vigentes, con aviso. */
  | "UNFROZEN_PACK";

export interface PeriodTerms {
  terms: PayrollTerms;
  source: PayrollTermsSource;
}

const TRANSITION = new Set<PayrollLegalFlags["transitionWeeklyThreshold"]>(["FULL", "PRORATED"]);

/** Términos vigentes de la empresa (banderas efectivas, con valores por defecto). */
export function currentPayrollTerms(company: Pick<CompanyPolicy, "overtimeMultiplier" | "payrollLegalFlags">): PayrollTerms {
  const f = legalFlags(company);
  return {
    overtimeMultiplier: company.overtimeMultiplier,
    payrollLegalFlags: { transitionWeeklyThreshold: f.transitionWeeklyThreshold, caDoubleTime: f.caDoubleTime, caSeventhDay: f.caSeventhDay },
  };
}

/** true si `v` son términos completos y válidos (los de un manifiesto v6). */
export function isPayrollTerms(v: unknown): v is PayrollTerms {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<PayrollTerms>;
  const f = t.payrollLegalFlags as Partial<PayrollLegalFlags> | undefined;
  return (
    typeof t.overtimeMultiplier === "number" &&
    Number.isFinite(t.overtimeMultiplier) &&
    t.overtimeMultiplier > 0 &&
    !!f &&
    typeof f === "object" &&
    typeof f.caDoubleTime === "boolean" &&
    typeof f.caSeventhDay === "boolean" &&
    TRANSITION.has(f.transitionWeeklyThreshold as PayrollLegalFlags["transitionWeeklyThreshold"])
  );
}

/** Pack más reciente del periodo exacto (createdAtMs descendente), o null. */
export function latestPeriodPack<T extends { periodStart: number; periodEnd: number; createdAtMs: number }>(
  packs: readonly T[],
  periodStart: number,
  periodEnd: number,
): T | null {
  return packs.filter((p) => p.periodStart === periodStart && p.periodEnd === periodEnd).sort((a, b) => b.createdAtMs - a.createdAtMs)[0] ?? null;
}

/**
 * Términos de un periodo a partir de su pack previo (o null si no hay):
 * v6 → los del pack; v1–v5 → vigentes con `UNFROZEN_PACK`; sin pack → vigentes.
 */
export function termsFromPack(
  previous: { payrollTerms?: unknown } | null | undefined,
  company: Pick<CompanyPolicy, "overtimeMultiplier" | "payrollLegalFlags">,
): PeriodTerms {
  if (!previous) return { terms: currentPayrollTerms(company), source: "CURRENT" };
  if (isPayrollTerms(previous.payrollTerms)) {
    const t = previous.payrollTerms;
    return {
      terms: {
        overtimeMultiplier: t.overtimeMultiplier,
        payrollLegalFlags: {
          transitionWeeklyThreshold: t.payrollLegalFlags.transitionWeeklyThreshold,
          caDoubleTime: t.payrollLegalFlags.caDoubleTime,
          caSeventhDay: t.payrollLegalFlags.caSeventhDay,
        },
      },
      source: "PACK",
    };
  }
  return { terms: currentPayrollTerms(company), source: "UNFROZEN_PACK" };
}

/** Términos del periodo desde una lista de packs (mismo criterio que policyForPeriod). */
export function termsForPeriod(
  packs: readonly { periodStart: number; periodEnd: number; createdAtMs: number; payrollTerms?: unknown }[],
  periodStart: number,
  periodEnd: number,
  company: Pick<CompanyPolicy, "overtimeMultiplier" | "payrollLegalFlags">,
): PeriodTerms {
  return termsFromPack(latestPeriodPack(packs, periodStart, periodEnd), company);
}

/**
 * La empresa con los términos del periodo: el motor lee el multiplicador de
 * `rates` y las banderas de `company.payrollLegalFlags`. Lo demás (tránsito,
 * almuerzo, calendario…) sigue siendo el vigente.
 */
export function companyWithTerms<C extends CompanyPolicy>(company: C, terms: PayrollTerms): C {
  return { ...company, overtimeMultiplier: terms.overtimeMultiplier, payrollLegalFlags: { ...terms.payrollLegalFlags } };
}
