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
import { formatCurrency, formatDate, formatRange, formatTime } from "../../utils/dateUtils";

export interface ReportInput {
  statement: PayrollStatement;
  evidence: EvidenceSummary;
  manifest: Pick<PackManifest, "packId" | "packHash" | "sealedAtMs" | "certified" | "policyId">;
  sessions: SessionRecord[];
  sites: Site[];
  profile: PersonProfile;
  company: CompanyPolicy;
}

const INTEGRITY_LABEL: Record<SessionRecord["integrityClass"], string> = {
  VALID: "Validada",
  MANUAL: "Ajuste manual",
  AUTO: "Cierre automático",
  CONFLICT: "Por revisar",
};

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
  .notes { font-style: italic; color: #666; font-size: 10px; display: block; margin-top: 4px; }
  .stamp { margin: 16px 0; padding: 10px; border: 2px dashed #c0392b; color: #c0392b; font-weight: bold; text-align: center; text-transform: uppercase; }
  .hash { font-family: Menlo, monospace; font-size: 10px; word-break: break-all; background: #f4f4f4; padding: 8px; border-radius: 4px; }
  .section-title { font-size: 12px; font-weight: bold; color: #000; text-transform: uppercase; margin: 20px 0 10px; }
  .log-item { font-size: 9px; color: #555; margin-bottom: 6px; border-left: 2px solid #ddd; padding-left: 10px; }
  .footer { margin-top: 40px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
`;

function siteAlias(sites: Site[], id: number | null): string {
  if (id === null) return "Sin destino";
  return sites.find((s) => s.id === id)?.alias ?? `Destino #${id}`;
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
        <div class="info-value">${escapeHtml(formatRange(statement.periodStart, statement.periodEnd))}</div>
      </div>
    </div>`;
}

function stats(st: PayrollStatement): string {
  return `
    <div class="stats-box">
      <div class="stat-item"><div class="stat-num">${st.regularHours.toFixed(2)}</div><div class="stat-desc">Regulares</div></div>
      <div class="stat-item"><div class="stat-num">${st.overtimeHours.toFixed(2)}</div><div class="stat-desc">Horas extra</div></div>
      <div class="stat-item"><div class="stat-num">${st.transitHours.toFixed(2)}</div><div class="stat-desc">Tránsito</div></div>
      <div class="stat-item"><div class="stat-num">${st.lunchMinutes}</div><div class="stat-desc">Almuerzo (min)</div></div>
      <div class="stat-item"><div class="stat-num" style="color:#D4AF37;">${formatCurrency(st.grossEstimate)}</div><div class="stat-desc">Estimado bruto</div></div>
    </div>`;
}

function sessionRows(input: ReportInput): string {
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  return input.statement.sessionIds
    .map((id) => {
      const s = byId.get(id);
      if (!s) return "";
      const lines = input.statement.lines.filter((l) => l.sessionId === id);
      const worked = lines.filter((l) => !l.kind.endsWith("DEDUCTION")).reduce((a, l) => a + l.minutes, 0);
      const amount = lines.reduce((a, l) => a + l.amount, 0);
      const start = s.actualStartAtMs ?? s.declaredStartAtMs;
      return `
        <tr>
          <td><strong>${formatDate(start)}</strong></td>
          <td>${escapeHtml(siteAlias(input.sites, s.siteId))}
            ${s.bookkeeping.manualNote ? `<span class="notes">"${escapeHtml(s.bookkeeping.manualNote)}"</span>` : ""}</td>
          <td>${formatTime(start)} - ${s.endAtMs ? formatTime(s.endAtMs) : "—"}</td>
          <td><strong>${(worked / 60).toFixed(2)}</strong></td>
          <td>${formatCurrency(amount)}</td>
          <td><span class="badge b-${s.integrityClass}">${INTEGRITY_LABEL[s.integrityClass]}</span></td>
        </tr>`;
    })
    .join("");
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
    <div style="font-size:9px;color:#777;margin-top:4px;">Empleado y empleador pueden comparar este código. Expediente ${escapeHtml(input.manifest.packId)} · sellado ${escapeHtml(formatDate(input.manifest.sealedAtMs))} ${escapeHtml(formatTime(input.manifest.sealedAtMs))}</div>`;
}

function uncertifiedStamp(input: ReportInput): string {
  return input.manifest.certified ? "" : `<div class="stamp">No certificado · hay sesiones por revisar</div>`;
}

/** Comprobante del empleado: resumen legible, sin rastro. */
export function renderEmployeeReceipt(input: ReportInput): string {
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${BASE_CSS}</style></head><body>
    ${header("Dual Tracker", "Comprobante del empleado", input)}
    ${uncertifiedStamp(input)}
    ${stats(input.statement)}
    <table><thead><tr><th>Fecha</th><th>Sitio</th><th>Horario</th><th>Hrs</th><th>Importe</th><th>Integridad</th></tr></thead><tbody>${sessionRows(input)}</tbody></table>
    ${hashBlock(input)}
    <div class="footer">Documento generado por Dual Tracker. Las cifras son el estado de nómina sellado del periodo.</div>
  </body></html>`;
}

/** Expediente del empleador: líneas, integridad, ledger y resumen de traza. */
export function renderEmployerDossier(input: ReportInput): string {
  const ev = input.evidence;
  const traces = ev.traces
    .map(
      (t) =>
        `<div class="log-item">Sesión #${t.sessionId}: ${t.pointCount} puntos · ${t.unreliableCount} no fiables · ${t.enterExit
          .map((e) => `${e.type} ${formatTime(e.timestampMs)}${e.reliable ? "" : " (no fiable)"}`)
          .join(", ") || "sin eventos de perímetro"}</div>`,
    )
    .join("");
  const conflicts = ev.conflicts.map((c) => `<div class="log-item">Sesión #${c.sessionId}: ${escapeHtml(c.reason)}</div>`).join("");
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${BASE_CSS}</style></head><body>
    ${header("Dual Tracker", "Expediente del empleador", input)}
    ${uncertifiedStamp(input)}
    ${stats(input.statement)}
    <div class="section-title">Sesiones</div>
    <table><thead><tr><th>Fecha</th><th>Sitio</th><th>Horario</th><th>Hrs</th><th>Importe</th><th>Integridad</th></tr></thead><tbody>${sessionRows(input)}</tbody></table>
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
