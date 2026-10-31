/**
 * Caso de uso: nómina semanal (Propuesta Técnica §7.1, flujo "Cerrar periodo").
 *   PayrollEngine.buildStatement (preview) → EvidencePack.seal → ReportService
 *   (PDF empleado + PDF empleador) → OfflineQueue.
 * `preview` no sella nada: lo usa la pantalla Reportes para mostrar el rollup.
 * `exportRangePdf` pinta el mismo rango en un PDF de caché y lo comparte.
 * No llama a seal ni escribe un expediente.
 */
import type { EvidenceSummary, PayrollStatement } from "../../../core/contracts";
import { DOCUMENT_VERSION } from "../../../core/contracts";
import { companyCalendar } from "../../../utils/companyPolicy";
import { toDateString } from "../../../utils/dateUtils";
import { combineWeekStatements, validateReportRange, workWeeksCovering, type ClosedRange, type RangeError } from "../../../utils/reportRange";
import { PayrollEngineService } from "../../domain/PayrollEngineService";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { ReportService } from "../../evidence/ReportService";
import type { ReportInput } from "../../evidence/reportTemplates";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";

/** Evidencia vacía: la copia de rango no finge un expediente ni un código. */
const RANGE_COPY_EVIDENCE: EvidenceSummary = {
  ledgerEntryCount: 0,
  ledgerHeadHash: "",
  ledgerChainValid: false,
  ledgerHashes: [],
  traces: [],
  conflicts: [],
};

export interface WeekPreview {
  start: number;
  end: number;
  statement: PayrollStatement;
}

export interface RangePreview {
  requested: ClosedRange;
  weeks: WeekPreview[];
}

export async function previewPayroll(periodStart: number, periodEnd: number): Promise<PayrollStatement> {
  const settings = await SettingsService.load();
  const sessions = await PersistenceService.listSessions({ from: periodStart, to: periodEnd, overlapping: true });
  const policyId = (await PersistenceService.packPolicyForPeriod(periodStart, periodEnd)) ?? settings.company.overtimePolicyId;
  const segmentedLedgerTimestamps = await IntegrityLedgerService.segmentedTimestamps();
  const statement = PayrollEngineService.buildStatement({
    periodStart,
    periodEnd,
    sessions,
    // Tarifa actual = respaldo: el motor usa la congelada en cada jornada (hourlyRateSnapshot, v8).
    rates: { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
    company: settings.company,
    policyId,
    nowMs: TimeAuthorityService.now(),
    segmentedLedgerTimestamps,
  });
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return {
    ...statement,
    sessionClasses: statement.sessionIds.flatMap((id) => {
      const s = byId.get(id);
      if (!s) return [];
      const blocked = (s.bookkeeping.certificationBlockers ?? []).length > 0;
      return [{ id, integrityClass: s.integrityClass, ...(blocked ? { blocked: true } : {}) }];
    }),
  };
}

/**
 * Una vista por cada semana laboral que toca el rango. Cada semana usa
 * previewPayroll (el mismo motor del expediente). No se abre un periodo
 * nuevo que mezcle el umbral de 40 h entre semanas.
 */
export async function previewPayrollRange(
  start: number,
  end: number,
): Promise<{ ok: true; data: RangePreview } | { ok: false; code: RangeError }> {
  const check = validateReportRange(start, end);
  if (!check.ok) return check;
  const settings = await SettingsService.load();
  const history = companyCalendar(settings.company);
  const bounds = workWeeksCovering(start, end, history);
  const weeks: WeekPreview[] = [];
  for (const week of bounds) {
    weeks.push({ start: week.start, end: week.end, statement: await previewPayroll(week.start, week.end) });
  }
  return { ok: true, data: { requested: { start, end }, weeks } };
}

/**
 * Sella el periodo. Si el contenido no cambió desde el último sello devuelve
 * ese pack con `reused: true`; `reissue` fuerza un pack nuevo (reemisión).
 */
export async function generateWeeklyPayroll(periodStart: number, periodEnd: number, allowUncertified = false, reissue = false) {
  return EvidencePackService.seal({ periodStart, periodEnd, allowUncertified, reissue });
}

function rangeFileId(start: number, end: number): string {
  const a = toDateString(start).replace(/-/g, "");
  const b = toDateString(end).replace(/-/g, "");
  return `range-${a}-${b}`;
}

/**
 * PDF del rango que Reportes ya muestra (semanas laborales sumadas, sin
 * recalcular horas extra). Se guarda en caché y se comparte. No sella,
 * no escribe pack ni asiento de nómina.
 */
export async function exportRangePdf(
  start: number,
  end: number,
): Promise<{ ok: true; uri: string; name: string } | { ok: false; code: RangeError | "EMPTY_PERIOD" | "SHARE_UNAVAILABLE" }> {
  const preview = await previewPayrollRange(start, end);
  if (!preview.ok) return preview;
  const weeks = preview.data.weeks;
  const combined = combineWeekStatements(weeks.map((week) => week.statement));
  if (!combined || combined.sessionIds.length === 0) return { ok: false, code: "EMPTY_PERIOD" };

  const settings = await SettingsService.load();
  const from = weeks[0].start;
  const to = weeks[weeks.length - 1].end;
  const sessions = await PersistenceService.listSessions({ from, to, overlapping: true });
  const ids = new Set(combined.sessionIds);
  const included = sessions.filter((session) => ids.has(session.id));
  const lang = settings.profile.language === "en" ? "en" : "es";
  const input: ReportInput = {
    statement: { ...combined, packHash: null },
    evidence: RANGE_COPY_EVIDENCE,
    manifest: {
      packId: rangeFileId(start, end),
      packHash: "",
      sealedAtMs: TimeAuthorityService.now(),
      certified: combined.integrityRollup.certified,
      policyId: combined.policyId,
      documentVersion: DOCUMENT_VERSION,
      documentTheme: settings.profile.comprobanteTheme === "dark" ? "dark" : "light",
      documentLocale: lang,
    },
    sessions: included,
    sites: await PersistenceService.listSites({ includeArchived: true }),
    profile: settings.profile,
    company: settings.company,
    rangeCopy: true,
    rangeWeekCount: weeks.length,
  };
  const rendered = await ReportService.renderPdf("EMPLOYEE_RECEIPT", input, { destination: "cache" });
  const shared = await ReportService.share(rendered.uri);
  if (!shared) return { ok: false, code: "SHARE_UNAVAILABLE" };
  return { ok: true, uri: rendered.uri, name: rendered.name };
}
