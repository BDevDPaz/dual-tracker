import * as Print from "expo-print";
// expo-file-system 19.x reorganizó su API; se usa el subpath "/legacy" para
// conservar las funciones clásicas (writeAsStringAsync, moveAsync,
// documentDirectory) documentadas en la propuesta y usadas en el resto del
// wave de servicios (EvidencePackService).
import * as FileSystem from "expo-file-system/legacy";
import escapeHtml from "escape-html";
import dayjs from "../utils/dayjsSetup";
import { formatDate } from "../utils/dateUtils";
import { LedgerEntry, PayrollLine, PayrollStatement } from "../core/contracts";

/**
 * ============================================================================
 * ReportService — Propuesta 4.5 (fusiona PDFService, ReportGenerator y
 * reportsAdapter)
 * ----------------------------------------------------------------------------
 * REGLA DE FRONTERA: este servicio NO calcula overtime, ni horas, ni monto de
 * pago. Recibe un `PayrollStatement` ya cerrado por `PayrollEngineService` y
 * únicamente lo renderiza en HTML → PDF. Cualquier suma que aparezca aquí es
 * de presentación (por ejemplo, agrupar líneas por tipo), nunca una regla de
 * negocio de nómina.
 *
 * Dos plantillas, según sección 8 ("Garantía recíproca empleado/empleador"):
 *  - `renderEmployeeReceipt`: horas netas + pago estimado. Sin coordenadas,
 *    sin desglose de excepciones internas, sin datos de otros empleados.
 *  - `renderEmployerDossier`: desglose completo + integridad + resumen de
 *    ledger + packHash impreso, visible y comparable con el del empleado.
 * ============================================================================
 */

const currency = (amount: number) => `$${amount.toFixed(2)}`;

/** Sanitiza un id de statement para uso seguro en nombre de archivo (sin PII). */
function safeStatementId(statementId: string): string {
  return statementId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function employeeFilename(statement: PayrollStatement): string {
  return `dualtracker_${safeStatementId(statement.id)}_employee.pdf`;
}

function employerFilename(statement: PayrollStatement): string {
  return `dualtracker_${safeStatementId(statement.id)}_employer.pdf`;
}

function baseStyles(): string {
  return `
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #D4AF37; padding-bottom: 12px; }
    .title { font-size: 24px; font-weight: 800; color: #000; letter-spacing: 2px; text-transform: uppercase; }
    .subtitle { font-size: 11px; color: #D4AF37; text-transform: uppercase; margin-top: 4px; letter-spacing: 1px; }
    .stats-box { display: flex; justify-content: space-between; margin-bottom: 24px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
    .stat-item { flex: 1; text-align: center; padding: 14px; border-right: 1px solid #eee; }
    .stat-item:last-child { border-right: none; background: #fffcf2; }
    .stat-num { font-size: 20px; font-weight: bold; color: #000; }
    .stat-desc { font-size: 9px; color: #666; text-transform: uppercase; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11px; }
    th { text-align: left; border-bottom: 2px solid #000; padding: 8px; text-transform: uppercase; font-size: 9px; color: #666; }
    td { border-bottom: 1px solid #eee; padding: 10px 8px; vertical-align: top; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; text-transform: uppercase; }
    .badge-valid { background: #e8f8ef; color: #1e8449; }
    .badge-manual { background: #fff8e1; color: #b7791f; }
    .badge-auto { background: #eef2f7; color: #34495e; }
    .badge-conflict { background: #fdecea; color: #c0392b; }
    .hash-box { margin-top: 20px; border-top: 2px solid #eee; padding-top: 12px; font-size: 10px; color: #555; word-break: break-all; }
    .hash-label { font-size: 9px; text-transform: uppercase; color: #999; font-weight: bold; }
    .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
  `;
}

function linesByKind(lines: PayrollLine[], kind: PayrollLine["kind"]): PayrollLine[] {
  return lines.filter((line) => line.kind === kind);
}

function sumAmount(lines: PayrollLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

/**
 * expo-print genera el PDF con un nombre aleatorio de caché. Lo movemos a un
 * nombre seguro y determinista (sin direcciones, coordenadas ni PII cruda),
 * derivado únicamente del id de statement, dentro del mismo directorio de
 * caché para no requerir permisos adicionales.
 */
async function renameToSafeFilename(sourceUri: string, safeFilename: string): Promise<string> {
  const directory = sourceUri.substring(0, sourceUri.lastIndexOf("/") + 1);
  const destinationUri = `${directory}${safeFilename}`;

  try {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true });
    await FileSystem.moveAsync({ from: sourceUri, to: destinationUri });
    return destinationUri;
  } catch {
    // Si el movimiento falla (por ejemplo, en un entorno de prueba sin FS
    // nativo), se conserva la URI original de expo-print como respaldo.
    return sourceUri;
  }
}

function badgeClassFor(integrityClass: string): string {
  switch (integrityClass) {
    case "VALID":
      return "badge-valid";
    case "MANUAL":
      return "badge-manual";
    case "AUTO":
      return "badge-auto";
    case "CONFLICT":
    default:
      return "badge-conflict";
  }
}

class ReportService {
  /**
   * Comprobante del empleado: horas netas y pago estimado. No incluye
   * coordenadas, ledger crudo ni desglose de excepciones internas del
   * empleador.
   */
  async renderEmployeeReceipt(statement: PayrollStatement): Promise<string> {
    const regularAmount = sumAmount(linesByKind(statement.lines, "REGULAR"));
    const overtimeAmount =
      sumAmount(linesByKind(statement.lines, "OVERTIME_DAILY")) +
      sumAmount(linesByKind(statement.lines, "OVERTIME_WEEKLY"));
    const transitAmount = sumAmount(linesByKind(statement.lines, "TRANSIT_PAID"));

    const hasConflict = statement.integrityRollup.CONFLICT > 0;

    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>${baseStyles()}</style>
        </head>
        <body>
          <div class="header">
            <div class="title">Dual Tracker</div>
            <div class="subtitle">Comprobante del empleado</div>
          </div>

          <p style="font-size:11px;color:#666;">
            Periodo: <strong>${escapeHtml(formatDate(statement.periodStart))} — ${escapeHtml(formatDate(statement.periodEnd))}</strong>
          </p>

          <div class="stats-box">
            <div class="stat-item">
              <div class="stat-num">${statement.regularHours.toFixed(2)}</div>
              <div class="stat-desc">Horas regulares</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${statement.overtimeHours.toFixed(2)}</div>
              <div class="stat-desc">Horas extra</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${statement.transitHours.toFixed(2)}</div>
              <div class="stat-desc">Horas de traslado</div>
            </div>
            <div class="stat-item">
              <div class="stat-num" style="color:#D4AF37;">${currency(statement.grossEstimate)}</div>
              <div class="stat-desc">Pago estimado</div>
            </div>
          </div>

          <table>
            <thead>
              <tr><th>Concepto</th><th>Horas</th><th>Monto</th></tr>
            </thead>
            <tbody>
              <tr><td>Horas regulares</td><td>${statement.regularHours.toFixed(2)}</td><td>${currency(regularAmount)}</td></tr>
              <tr><td>Horas extra (diario + semanal)</td><td>${statement.overtimeHours.toFixed(2)}</td><td>${currency(overtimeAmount)}</td></tr>
              <tr><td>Traslado remunerado</td><td>${statement.transitHours.toFixed(2)}</td><td>${currency(transitAmount)}</td></tr>
              <tr><td>Almuerzo (no remunerado)</td><td>${(statement.lunchMinutes / 60).toFixed(2)}</td><td>${currency(0)}</td></tr>
            </tbody>
          </table>

          ${
            hasConflict
              ? `<p style="font-size:11px;color:#c0392b;font-weight:bold;">
                  Este periodo incluye jornadas marcadas como CONFLICT. El pago estimado se muestra,
                  pero queda etiquetado como no certificado hasta su revisión.
                </p>`
              : ""
          }

          <div class="hash-box">
            <div class="hash-label">Identificador de comprobante (packHash)</div>
            ${escapeHtml(statement.packHash)}
          </div>

          <div class="footer">
            Documento generado electrónicamente por Dual Tracker.<br>
            Certificado digitalmente: ${dayjs(statement.generatedAtMs).format("YYYY-MM-DD HH:mm:ss")}
          </div>
        </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return renameToSafeFilename(uri, employeeFilename(statement));
  }

  /**
   * Expediente del empleador: desglose completo, excepciones/integridad y
   * resumen del ledger, con el packHash impreso — el MISMO que ve el
   * empleado, ya que ambos PDF renderizan el mismo `PayrollStatement` sin
   * recalcular nada.
   */
  async renderEmployerDossier(
    statement: PayrollStatement,
    ledgerEntries: LedgerEntry[],
  ): Promise<string> {
    const rollupRows = (
      Object.keys(statement.integrityRollup) as (keyof typeof statement.integrityRollup)[]
    )
      .map(
        (integrityClass) => `
          <tr>
            <td><span class="badge ${badgeClassFor(integrityClass)}">${integrityClass}</span></td>
            <td>${statement.integrityRollup[integrityClass]}</td>
          </tr>
        `,
      )
      .join("");

    const ledgerRows = ledgerEntries
      .map(
        (entry) => `
          <tr>
            <td>${dayjs(entry.timestampMs).format("YYYY-MM-DD HH:mm:ss")}</td>
            <td>${escapeHtml(entry.sessionId.toString())}</td>
            <td>${escapeHtml(entry.actor)}</td>
            <td>${escapeHtml(entry.intent)}</td>
            <td><span class="badge ${badgeClassFor(entry.integrityClass)}">${entry.integrityClass}</span></td>
            <td>${entry.reasonCode ? escapeHtml(entry.reasonCode) : "—"}</td>
            <td style="font-size:8px;word-break:break-all;">${escapeHtml(entry.hash)}</td>
          </tr>
        `,
      )
      .join("");

    const lineRows = statement.lines
      .map(
        (line) => `
          <tr>
            <td>${escapeHtml(line.kind)}</td>
            <td>${line.sessionId ?? "—"}</td>
            <td>${line.minutes}</td>
            <td>${currency(line.rate)}</td>
            <td>${currency(line.amount)}</td>
            <td>${escapeHtml(line.description)}</td>
          </tr>
        `,
      )
      .join("");

    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>${baseStyles()}</style>
        </head>
        <body>
          <div class="header">
            <div class="title">Dual Tracker</div>
            <div class="subtitle">Expediente del empleador</div>
          </div>

          <p style="font-size:11px;color:#666;">
            Periodo: <strong>${escapeHtml(formatDate(statement.periodStart))} — ${escapeHtml(formatDate(statement.periodEnd))}</strong><br>
            Política de nómina: <strong>${escapeHtml(statement.policyId)}</strong>
          </p>

          <div class="stats-box">
            <div class="stat-item">
              <div class="stat-num">${statement.regularHours.toFixed(2)}</div>
              <div class="stat-desc">Regulares</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${statement.overtimeHours.toFixed(2)}</div>
              <div class="stat-desc">Overtime</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${statement.transitHours.toFixed(2)}</div>
              <div class="stat-desc">Tránsito</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${(statement.lunchMinutes / 60).toFixed(2)}</div>
              <div class="stat-desc">Almuerzo (h)</div>
            </div>
            <div class="stat-item">
              <div class="stat-num" style="color:#D4AF37;">${currency(statement.grossEstimate)}</div>
              <div class="stat-desc">Total estimado</div>
            </div>
          </div>

          <h3 style="font-size:12px;text-transform:uppercase;">Líneas de nómina</h3>
          <table>
            <thead>
              <tr><th>Tipo</th><th>Sesión</th><th>Minutos</th><th>Tarifa</th><th>Monto</th><th>Descripción</th></tr>
            </thead>
            <tbody>${lineRows}</tbody>
          </table>

          <h3 style="font-size:12px;text-transform:uppercase;">Resumen de integridad</h3>
          <table>
            <thead><tr><th>Clase</th><th>Sesiones</th></tr></thead>
            <tbody>${rollupRows}</tbody>
          </table>

          <h3 style="font-size:12px;text-transform:uppercase;">Resumen del ledger</h3>
          <table>
            <thead>
              <tr><th>Fecha</th><th>Sesión</th><th>Actor</th><th>Intención</th><th>Integridad</th><th>Motivo</th><th>Hash</th></tr>
            </thead>
            <tbody>
              ${
                ledgerEntries.length === 0
                  ? '<tr><td colspan="7" style="font-size:10px;color:#999;">Sin asientos en este periodo.</td></tr>'
                  : ledgerRows
              }
            </tbody>
          </table>

          <div class="hash-box">
            <div class="hash-label">packHash (compartido con el comprobante del empleado)</div>
            ${escapeHtml(statement.packHash)}
          </div>

          <div class="footer">
            Documento generado electrónicamente por Dual Tracker.<br>
            Certificado digitalmente: ${dayjs(statement.generatedAtMs).format("YYYY-MM-DD HH:mm:ss")}
          </div>
        </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return renameToSafeFilename(uri, employerFilename(statement));
  }
}

export const reportService = new ReportService();
export const reportFilenames = {
  employee: employeeFilename,
  employer: employerFilename,
};
