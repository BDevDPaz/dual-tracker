/**
 * Plantillas HTML de ReportService (Propuesta Técnica §4.5).
 * Portadas del HTML de ReportGenerator.ts (GEOTrack/LEDTracker), con dos
 * cambios de fondo:
 *  - NO calculan horas ni overtime: pintan un PayrollStatement ya cerrado.
 *  - La sección de auditoría sale del IntegrityLedger (EvidenceSummary), no
 *    de un SELECT a audit_logs.
 * Se eliminó el nombre de empresa en duro ("LEON'S ELECTRICAL DESIGN"):
 * sale de company.employerName.
 * Todo texto de usuario pasa por escape-html.
 */
import escapeHtml from "escape-html";
import type {
  CompanyPolicy,
  EvidenceSummary,
  PackManifest,
  PayrollLine,
  PayrollStatement,
  PersonProfile,
  SessionRecord,
  Site,
} from "../../core/contracts";
import { t } from "../../i18n";
import { renderPremiumDocument } from "./reportPremium";
import { formatCurrency, formatDate, formatRange, formatTime, type FormatOptions } from "../../utils/dateUtils";
import { companyCalendar } from "../../utils/companyPolicy";
import { displayStatement, formatHundredths, formatSiteName, minutesToHundredths, noteToHtml } from "../domain/payrollDisplay";
import type { PowerOffNote } from "./deviceOffGap";
import { periodSliceOf } from "../domain/periodSlice";
import { getPayrollPolicy } from "../domain/payrollPolicies";
import { checkedInSiteIds } from "../domain/siteVisits";

/**
 * La plantilla heredada (sin documentVersion, o v1) se emite SIEMPRE en
 * español. El documento v2 usa documentLocale / documentTheme, congelados al
 * sellar y fuera del hash. Ver docs/COMPROBANTES_PREMIUM.md y docs/IDIOMA.md.
 */
const ES: FormatOptions = { lang: "es" };

/** Anexos que se eligen al compartir. No forman parte del sello. */
export interface ReportAnnexOptions {
  ledger?: boolean;
  enterExit?: boolean;
}

/** Fila de bitácora ya recortada: sin payloadJson, para no pintar coordenadas. */
export interface ForensicLedgerRow {
  id: number;
  sessionId: number | null;
  timestampMs: number;
  actor: string;
  intent: string;
  fromState: string | null;
  toState: string | null;
  reason: string;
  integrityClass: string | null;
  hash: string;
  prevHash: string;
  /** Texto ya traducido, sin coordenadas. El sello no lo guarda. */
  detail?: string;
}

export interface ReportInput {
  statement: PayrollStatement;
  evidence: EvidenceSummary;
  manifest: Pick<
    PackManifest,
    | "packId"
    | "packHash"
    | "sealedAtMs"
    | "certified"
    | "policyId"
    | "sealWarnings"
    | "signature"
    | "manifestVersion"
    | "documentVersion"
    | "documentTheme"
    | "documentLocale"
    | "appVersion"
    | "versionCode"
    | "gitCommit"
    | "sessionTimeZones"
  >;
  sessions: SessionRecord[];
  sites: Site[];
  profile: PersonProfile;
  company: CompanyPolicy;
  /** Solo documento v2. El sello guardado no los incluye. */
  annex?: ReportAnnexOptions;
  /** Marca de agua PRÁCTICA. El sello real no la pone. */
  practice?: boolean;
  /** Asientos ya filtrados al expediente. Solo si annex.ledger. */
  ledger?: ForensicLedgerRow[];
  /**
   * Cortes de teléfono leídos del ledger al pintar. No entran en contentHash:
   * el PDF es presentación. Ausente si no hubo OS_KILL.
   */
  powerOffs?: PowerOffNote[];
}

export function isPremiumDocument(input: ReportInput): boolean {
  return (input.manifest.documentVersion ?? 1) >= 2;
}

const INTEGRITY_LABEL: Record<SessionRecord["integrityClass"], string> = {
  VALID: "Validada",
  MANUAL: "Ajuste manual",
  AUTO: "Cierre automático",
  CONFLICT: "Por revisar",
};

function integrityLabelEs(s: SessionRecord): string {
  const reason = s.bookkeeping.integrityReason;
  if (reason === "RECOVERED_CLOSED" || reason === "ORPHAN_CONTINUED" || reason === "ORPHAN_END_CONFIRMED") return "Recuperada";
  return INTEGRITY_LABEL[s.integrityClass];
}

const LINE_LABEL: Record<PayrollLine["kind"], string> = {
  REGULAR: "Regular",
  OVERTIME_DAILY: "OT diario",
  OVERTIME_WEEKLY: "OT semanal",
  OVERTIME_DOUBLE: "Doble tiempo",
  TRANSIT: "Tránsito",
  LUNCH_DEDUCTION: "Almuerzo (deducción)",
  PAUSE_DEDUCTION: "Pausa (deducción)",
};

const BASE_CSS = `
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; }
  .title { font-size: 24px; font-weight: 800; color: #000; letter-spacing: 2px; text-transform: uppercase; }
  .subtitle { font-size: 11px; color: #D4AF37; text-transform: uppercase; margin-top: 5px; letter-spacing: 1px; }
  .info-grid { display: flex; justify-content: space-between; margin-bottom: 24px; background: #f8f8f8; padding: 15px; border-radius: 8px; }
  .info-col { width: 48%; }
  .info-label { font-size: 9px; color: #999; text-transform: uppercase; font-weight: bold; margin-bottom: 2px; }
  .info-value { font-size: 13px; color: #000; font-weight: 600; margin-bottom: 10px; }
  .stats-box { display: flex; justify-content: space-between; margin-bottom: 24px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
  .stat-item { flex: 1; text-align: center; padding: 12px; border-right: 1px solid #eee; }
  .stat-item:last-child { border-right: none; background: #fffcf2; }
  .stat-num { font-size: 20px; font-weight: bold; color: #000; }
  .stat-desc { font-size: 9px; color: #666; text-transform: uppercase; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 11px; }
  th { text-align: left; border-bottom: 2px solid #000; padding: 8px; text-transform: uppercase; font-size: 9px; color: #666; }
  td { border-bottom: 1px solid #eee; padding: 10px 8px; vertical-align: top; }
  .badge { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; text-transform: uppercase; display: inline-block; }
  .b-VALID { background: #e8f8ef; color: #1e8449; }
  .b-MANUAL { background: #fff4e0; color: #b9770e; }
  .b-AUTO { background: #eaf2fb; color: #2471a3; }
  .b-CONFLICT { background: #fdecea; color: #c0392b; }
  .notes { font-style: italic; color: #666; font-size: 10px; display: block; margin-top: 4px; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; line-height: 1.35; }
  .grapheme { white-space: nowrap; display: inline; font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Helvetica Neue", Helvetica, Arial, sans-serif; }
  .mins, .addr { display: block; font-size: 9px; color: #888; font-weight: normal; margin-top: 2px; }
  .seal-warning { margin: 12px 0; padding: 10px; border: 1px solid #b9770e; color: #7e5109; background: #fef5e7; font-size: 11px; }
  .stamp { margin: 16px 0; padding: 10px; border: 2px dashed #c0392b; color: #c0392b; font-weight: bold; text-align: center; text-transform: uppercase; }
  .hash { font-family: Menlo, monospace; font-size: 10px; word-break: break-all; background: #f4f4f4; padding: 8px; border-radius: 4px; }
  .section-title { font-size: 12px; font-weight: bold; color: #000; text-transform: uppercase; margin: 20px 0 10px; }
  .log-item { font-size: 9px; color: #555; margin-bottom: 6px; border-left: 2px solid #ddd; padding-left: 10px; }
  .footer { margin-top: 40px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
`;

function siteAliasHtml(sites: Site[], id: number | null): string {
  if (id === null) return "Sin destino";
  const site = sites.find((s) => s.id === id);
  const name = formatSiteName(site);
  if (!name.primary) return `Destino #${id}`;
  const primary = escapeHtml(name.primary);
  return name.address ? `${primary}<span class="addr">${escapeHtml(name.address)}</span>` : primary;
}

/** Cadena de destinos de la jornada (origen → llegadas). Un solo sitio queda igual. */
function sessionSitesLabel(session: SessionRecord, sites: Site[]): string {
  const ids = checkedInSiteIds(session);
  if (!ids.length) return siteAliasHtml(sites, session.siteId);
  return ids.map((id) => siteAliasHtml(sites, id)).join(" → ");
}

function header(title: string, subtitle: string, input: ReportInput): string {
  const { profile, company, statement } = input;
  return `
    <div class="header">
      <div class="title">${escapeHtml(title)}</div>
      <div class="subtitle">${escapeHtml(subtitle)}</div>
    </div>
    <div class="info-grid">
      <div class="info-col">
        <div class="info-label">Empleado</div>
        <div class="info-value">${escapeHtml(profile.employeeName || "No especificado")}</div>
        <div class="info-label">Política</div>
        <div class="info-value">${escapeHtml(statement.policyId)}</div>
      </div>
      <div class="info-col" style="text-align:right;">
        <div class="info-label">Empresa</div>
        <div class="info-value">${escapeHtml(company.employerName || "No especificada")}</div>
        <div class="info-label">Periodo</div>
        <div class="info-value">${escapeHtml(formatRange(statement.periodStart, statement.periodEnd, ES))}</div>
      </div>
    </div>`;
}

function stats(st: PayrollStatement): string {
  const d = displayStatement(st);
  return `
    <div class="stats-box">
      <div class="stat-item"><div class="stat-num">${d.regular}</div><div class="stat-desc">Regulares</div></div>
      <div class="stat-item"><div class="stat-num">${d.overtime}</div><div class="stat-desc">Horas extra</div></div>
      <div class="stat-item"><div class="stat-num">${d.transit}</div><div class="stat-desc">Tránsito</div></div>
      <div class="stat-item"><div class="stat-num">${st.lunchMinutes}</div><div class="stat-desc">Almuerzo (min)</div></div>
      <div class="stat-item"><div class="stat-num" style="color:#D4AF37;">${d.gross}</div><div class="stat-desc">Estimado bruto</div></div>
    </div>`;
}

/** Fila sin minutos pagados y sin importe. El comprobante del empleado no la lista. */
function isZeroPayRow(minutes: number, amountCents: number): boolean {
  return minutes <= 0 && amountCents === 0;
}

function sessionRows(input: ReportInput, omitZeroPay: boolean): { html: string; omitted: number } {
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  const shown = displayStatement(input.statement);
  const bySession = new Map(shown.rows.map((r) => [r.sessionId, r]));
  const split = getPayrollPolicy(input.statement.policyId).segmentation === "WORKDAY";
  const history = companyCalendar(input.company);
  let omitted = 0;
  const html = input.statement.sessionIds
    .map((id) => {
      const s = byId.get(id);
      if (!s) return "";
      const row = bySession.get(id);
      const minutes = row?.workedMinutes ?? 0;
      const hours = formatHundredths(minutesToHundredths(minutes));
      const amountCents = row?.amountCents ?? 0;
      if (omitZeroPay && isZeroPayRow(minutes, amountCents)) {
        omitted += 1;
        return "";
      }
      const start = s.actualStartAtMs ?? s.declaredStartAtMs;
      const slice = split ? periodSliceOf(s, input.statement.periodStart, input.statement.periodEnd, history, input.statement.periodEnd) : null;
      const from = slice?.displayStartMs ?? start;
      const to = slice?.displayEndMs ?? s.endAtMs;
      const cont: string[] = [];
      if (slice?.continuesFromMs != null) cont.push(`continúa de ${formatDate(slice.continuesFromMs, ES)}`);
      if (slice?.continuesUntilMs != null) cont.push(`continúa el ${formatDate(slice.continuesUntilMs, ES)}`);
      const zero = slice?.zeroDuration ?? (s.endAtMs !== null && Math.round((s.endAtMs - start) / 60000) <= 0);
      const note = s.bookkeeping.manualNote ? noteToHtml(s.bookkeeping.manualNote, escapeHtml) : "";
      return `
        <tr>
          <td><strong>${formatDate(from, ES)}</strong></td>
          <td>${sessionSitesLabel(s, input.sites)}
            ${note ? `<span class="notes">"${note}"</span>` : ""}</td>
          <td>${formatTime(from, ES)} - ${to != null ? formatTime(to, ES) : "—"}${cont.length ? `<span class="notes">(${escapeHtml(cont.join("; "))})</span>` : ""}${zero ? `<span class="notes">Duración cero: no suma al pago. Conservada para auditoría.</span>` : ""}</td>
          <td><strong>${hours}</strong><span class="mins">${minutes} min</span></td>
          <td>${row?.amount ?? formatCurrency(0)}</td>
          <td><span class="badge b-${s.integrityClass}">${integrityLabelEs(s)}</span></td>
        </tr>`;
    })
    .join("");
  return { html, omitted };
}

/** Aviso del comprobante. Siempre en español: el PDF no sigue el idioma de la UI. */
function omittedNote(count: number): string {
  if (count <= 0) return "";
  return `<p class="notes">${escapeHtml(t("reports.zeroRowsOmitted", { count }, "es"))}</p>`;
}

function linesTable(st: PayrollStatement): string {
  const rows = st.lines
    .map(
      (l) => `<tr><td>${escapeHtml(l.dateString)}</td><td>#${l.sessionId}</td><td>${LINE_LABEL[l.kind]}</td><td>${l.minutes}</td><td>${formatCurrency(l.rate)}</td><td>${formatCurrency(l.amount)}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Fecha</th><th>Sesión</th><th>Concepto</th><th>Min</th><th>Tarifa</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function hashBlock(input: ReportInput): string {
  return `
    <div class="section-title">Código de verificación del expediente</div>
    <div class="hash">${escapeHtml(input.manifest.packHash)}</div>
    <div style="font-size:9px;color:#777;margin-top:4px;">Empleado y empleador pueden comparar este código. Expediente ${escapeHtml(input.manifest.packId)} · sellado ${escapeHtml(formatDate(input.manifest.sealedAtMs, ES))} ${escapeHtml(formatTime(input.manifest.sealedAtMs, ES))}</div>`;
}

function uncertifiedStamp(input: ReportInput): string {
  return input.manifest.certified ? "" : `<div class="stamp">No certificado · hay sesiones por revisar</div>`;
}

/** FieldCrypto §14/§15: advertencia del sello (microcopy exacta). No es contenido: sale del manifiesto. */
export const SEAL_WARNING_TEXT =
  "Advertencia: en el dispositivo que emitió este expediente, las notas y ubicaciones de algunas jornadas no eran legibles. Las horas y la integridad no se ven afectadas.";

function sealWarningBlock(input: ReportInput): string {
  const w = input.manifest.sealWarnings ?? [];
  if (!w.length) return "";
  const ids = w.flatMap((x) => x.sessionIds).map((id) => `#${id}`).join(", ");
  return `<div class="seal-warning">${escapeHtml(SEAL_WARNING_TEXT)}<div style="font-size:9px;margin-top:4px;">Jornadas: ${escapeHtml(ids)}</div></div>`;
}

function minutes1(ms: number): string {
  return String(Math.round((ms / 60_000) * 10) / 10);
}

function coverageBlock(evidence: {
  monitoringCoverage?: { sessionId: number; coveragePercent: number | null; unmonitoredMs: number }[];
}): string {
  const rows = evidence.monitoringCoverage ?? [];
  if (!rows.length) return "";
  const body = rows
    .map((row) => {
      const text =
        row.coveragePercent === null
          ? t("comprobante.coverageUnknown", { id: row.sessionId })
          : t("comprobante.coverageLine", { id: row.sessionId, percent: row.coveragePercent, minutes: minutes1(row.unmonitoredMs) });
      return `<div class="log-item" data-coverage-session="${row.sessionId}">${escapeHtml(text)}</div>`;
    })
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.coverageTitle"))}</div><p>${escapeHtml(t("comprobante.coverageHint"))}</p><div data-monitoring-coverage="1">${body}</div>`;
}

function replayBlock(evidence: {
  sessionReplay?: {
    sessionId: number;
    status: string;
    stored: { workedMinutes: number; transitMinutes: number; breakMinutes: number } | null;
    ledger: { workedMinutes: number; transitMinutes: number; breakMinutes: number } | null;
  }[];
}): string {
  const rows = evidence.sessionReplay ?? [];
  if (!rows.length) return "";
  const body = rows
    .map((row) => {
      const text =
        row.status === "MISMATCH"
          ? t("comprobante.replayMismatch", {
              id: row.sessionId,
              storedWork: row.stored?.workedMinutes ?? t("comprobante.replayMissing"),
              storedTransit: row.stored?.transitMinutes ?? t("comprobante.replayMissing"),
              storedBreak: row.stored?.breakMinutes ?? t("comprobante.replayMissing"),
              ledgerWork: row.ledger?.workedMinutes ?? t("comprobante.replayMissing"),
              ledgerTransit: row.ledger?.transitMinutes ?? t("comprobante.replayMissing"),
              ledgerBreak: row.ledger?.breakMinutes ?? t("comprobante.replayMissing"),
            })
          : t(
              row.status === "MATCH"
                ? "comprobante.replayMatch"
                : row.status === "INCOMPLETE"
                  ? "comprobante.replayIncomplete"
                  : "comprobante.replaySkipped",
              { id: row.sessionId },
            );
      return `<div class="log-item" data-session-replay="${row.sessionId}" data-replay-status="${row.status}">${escapeHtml(text)}</div>`;
    })
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.replayTitle"))}</div><p>${escapeHtml(t("comprobante.replayHint"))}</p><div data-session-replay="1">${body}</div>`;
}

function trustBlock(evidence: { locationTrust?: { sessionId: number; score: number; label: string }[] }): string {
  const rows = evidence.locationTrust ?? [];
  if (!rows.length) return "";
  const body = rows
    .map((row) => `<div class="log-item" data-location-trust="${row.sessionId}">#${row.sessionId}: ${row.score}/100 · ${escapeHtml(t(`health.trust.labels.${row.label}`))}</div>`)
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.trustTitle"))}</div><p>${escapeHtml(t("comprobante.trustHint"))}</p>${body}`;
}

function deviceBlock(evidence: { deviceIntegrity?: { rooted: boolean | null; emulator: boolean | null; developerOptionsEnabled: boolean | null; rootHits: string[]; emulatorHits: string[] } | null }): string {
  const device = evidence.deviceIntegrity;
  if (!device) return "";
  const bits: string[] = [];
  if (device.rooted) bits.push(t("comprobante.deviceRoot", { hits: device.rootHits.join(", ") || "—" }));
  if (device.emulator) bits.push(t("comprobante.deviceEmulator", { hits: device.emulatorHits.join(", ") || "—" }));
  if (device.developerOptionsEnabled) bits.push(t("comprobante.deviceDeveloper"));
  const text = bits.length ? bits.join(" · ") : t("comprobante.deviceClear");
  return `<div class="seal-warning" data-device-integrity="1">${escapeHtml(t("comprobante.deviceTitle"))}: ${escapeHtml(text)}</div>`;
}

/** Id forense de cada jornada sellada. Sin sellos, el HTML no cambia. */
function forensicBlock(evidence: { sessionSeals?: { sessionId: number; sessionHash: string }[] }): string {
  const seals = evidence.sessionSeals ?? [];
  if (!seals.length) return "";
  const rows = seals
    .map((seal) => `<div class="log-item" data-session-forensic="${seal.sessionId}">${escapeHtml(t("comprobante.forensicTitle"))} #${seal.sessionId}: <span class="hash">${escapeHtml(seal.sessionHash)}</span></div>`)
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.forensicTitle"))}</div>${rows}`;
}

/** Solo si hubo lecturas simuladas. Un expediente sin ellas no cambia el HTML. */
function mockLocationBlock(traces: { mockedFacts?: number }[]): string {
  const n = traces.reduce((sum, tr) => sum + (tr.mockedFacts && tr.mockedFacts > 0 ? tr.mockedFacts : 0), 0);
  if (n <= 0) return "";
  return `<div class="seal-warning" data-mock-location="1">${escapeHtml(t("comprobante.mockLocation", { n }))}</div>`;
}

/** Comprobante del empleado: resumen legible, sin rastro. Las filas de 0 min no se listan. */
export function renderEmployeeReceipt(input: ReportInput): string {
  if (isPremiumDocument(input)) return renderPremiumDocument(input, "EMPLOYEE_RECEIPT");
  const rows = sessionRows(input, true);
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${BASE_CSS}</style></head><body>
    ${header("Dual Tracker", "Comprobante del empleado", input)}
    ${uncertifiedStamp(input)}
    ${sealWarningBlock(input)}
    ${mockLocationBlock(input.evidence.traces)}
    ${forensicBlock(input.evidence)}
    ${trustBlock(input.evidence)}
    ${coverageBlock(input.evidence)}
    ${replayBlock(input.evidence)}
    ${deviceBlock(input.evidence)}
    ${stats(input.statement)}
    <table><thead><tr><th>Fecha</th><th>Sitio</th><th>Horario</th><th>Hrs</th><th>Importe</th><th>Integridad</th></tr></thead><tbody>${rows.html}</tbody></table>
    ${omittedNote(rows.omitted)}
    ${hashBlock(input)}
    <div class="footer">Documento generado por Dual Tracker. Las cifras son el estado de nómina sellado del periodo.</div>
  </body></html>`;
}

/** Expediente del empleador: líneas, integridad, ledger y resumen de traza. */
export function renderEmployerDossier(input: ReportInput): string {
  if (isPremiumDocument(input)) return renderPremiumDocument(input, "EMPLOYER_DOSSIER");
  const ev = input.evidence;
  const traces = ev.traces
    .map(
      (t) =>
        `<div class="log-item">Sesión #${t.sessionId}: ${t.pointCount} puntos · ${t.unreliableCount} no fiables · ${t.enterExit
          .map((e) => `${e.type} ${formatTime(e.timestampMs, ES)}${e.reliable ? "" : " (no fiable)"}`)
          .join(", ") || "sin eventos de perímetro"}</div>`,
    )
    .join("");
  const conflicts = ev.conflicts.map((c) => `<div class="log-item">Sesión #${c.sessionId}: ${escapeHtml(c.reason)}</div>`).join("");
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${BASE_CSS}</style></head><body>
    ${header("Dual Tracker", "Expediente del empleador", input)}
    ${uncertifiedStamp(input)}
    ${sealWarningBlock(input)}
    ${mockLocationBlock(input.evidence.traces)}
    ${forensicBlock(input.evidence)}
    ${trustBlock(input.evidence)}
    ${coverageBlock(input.evidence)}
    ${replayBlock(input.evidence)}
    ${deviceBlock(input.evidence)}
    ${stats(input.statement)}
    <div class="section-title">Sesiones</div>
    <table><thead><tr><th>Fecha</th><th>Sitio</th><th>Horario</th><th>Hrs</th><th>Importe</th><th>Integridad</th></tr></thead><tbody>${sessionRows(input, false).html}</tbody></table>
    <div class="section-title">Líneas de nómina</div>
    ${linesTable(input.statement)}
    <div class="section-title">Integridad</div>
    <div class="log-item">Asientos del ledger: ${ev.ledgerEntryCount} · cadena ${ev.ledgerChainValid ? "íntegra" : "ROTA"}</div>
    <div class="log-item">Cabeza del ledger: <span class="hash">${escapeHtml(ev.ledgerHeadHash)}</span></div>
    ${conflicts || '<div class="log-item">Sin conflictos abiertos.</div>'}
    ${input.statement.appliedRules?.length ? `<div class="section-title">Reglas legales opcionales aplicadas</div>${input.statement.appliedRules.map((r) => `<div class="log-item">${escapeHtml(r)}</div>`).join("")}` : ""}
    ${input.statement.warnings.length ? `<div class="section-title">Advertencias</div>${input.statement.warnings.map((w) => `<div class="log-item">${escapeHtml(w)}</div>`).join("")}` : ""}
    <div class="section-title">Resumen de traza</div>
    ${traces || '<div class="log-item">Periodo registrado solo por geocerca.</div>'}
    ${hashBlock(input)}
    <div class="footer">Documento generado por Dual Tracker. El manifiesto JSON acompaña a este expediente.</div>
  </body></html>`;
}
