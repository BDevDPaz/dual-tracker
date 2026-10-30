/**
 * @deprecated Operational weekly report. Pay here is estimate.
 * Authoritative payroll: PayrollEngineService.computeStatement.
 */
// --- src/services/ReportGenerator.ts ---
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import { getSettings, getAllAsync } from "../database/db";
import escapeHtml from "escape-html";
// types removed
import { log } from "../utils/logger";
import dayjs from "../utils/dayjsSetup";
import { formatDate, formatTime } from "../utils/dateUtils";
import { calculateSessionDuration, calculatePay } from "../utils/payrollUtils";
type AuditLog = any;
type AppSettings = any;
type WorkSession = any;

const formatCurrency = (amount: number) => {
  return `$${amount.toFixed(2)}`;
};

export const generateWeeklyReport = async (
  shouldShare: boolean = true,
  customRange?: { start: number; end: number },
): Promise<string | null> => {
  try {
    const settings = await getSettings();

    if (!settings) {
      log(
        "ROJO",
        "ERROR_CRITICO",
        "ERROR",
        "No se encontró la configuración (Settings) al generar reporte",
      );
      return null;
    }

    let startTs: number;
    let endTs: number;
    let rangeTitle = "";

    if (customRange) {
      startTs = customRange.start;
      endTs = customRange.end;
      rangeTitle = `${formatDate(startTs)} - ${formatDate(endTs)}`;
    } else {
      // Cálculo preciso e inmutable del inicio y fin de semana usando dayjs
      const start = dayjs().startOf("week");
      const end = dayjs().endOf("week");

      startTs = start.valueOf();
      endTs = end.valueOf();
      rangeTitle = "Semana Actual";
    }

    const sessions = await getAllAsync<WorkSession>(
      `SELECT * FROM work_sessions
       WHERE start_time >= ? AND start_time <= ?
       ORDER BY start_time ASC`,
      [startTs, endTs],
    );

    const logs = await getAllAsync<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC`,
      [startTs, endTs],
    );

    let totalHours = 0;
    let totalOvertime = 0;
    let totalEarnings = 0;
    type ReportRow = {
      date: string;
      client: string;
      address: string;
      notes: string;
      start: string;
      end: string;
      lunch: string;
      total: string;
      pay: string;
      status: string;
      isGeofenceIn: boolean;
      isGeofenceOut: boolean;
    };

    const rows: ReportRow[] = sessions.map((session: WorkSession) => {
      const startTime = session.actual_start_time || session.start_time;
      const endTime = session.end_time || dayjs().valueOf();

      // Delegamos el cálculo a nuestra utilidad centralizada
      const durationMs = calculateSessionDuration(
        startTime,
        endTime,
        session.lunch_taken || 0,
        session.lunch_start,
        session.lunch_end,
      );

      const hours = durationMs / (1000 * 60 * 60);

      // Calculamos nómina exacta incluyendo horas extra (OT)
      const { totalPay: pay, overtimeHours: otHours } = calculatePay(
        hours,
        settings.hourly_rate,
        settings.overtime_multiplier,
      );

      totalHours += hours;
      totalOvertime += otHours;
      totalEarnings += pay;

      // ✅ Busca auto-checkout usando el nombre actual de auditoría
      const fueAutoCheckout = logs.some(
        (l: AuditLog) => l.session_id === session.id && l.action_type.includes("AUTO_CHECKOUT"),
      );

      return {
        date: formatDate(startTime),
        client: escapeHtml(session.client_name || "General"),
        address: escapeHtml(session.address || ""),
        notes: escapeHtml(session.manual_note || ""),
        start: formatTime(startTime),
        end: session.end_time ? formatTime(session.end_time) : "En curso",
        lunch: session.lunch_taken ? "Sí" : "No",
        total: hours.toFixed(2),
        pay: formatCurrency(pay),
        status: session.status,
        isGeofenceIn: Boolean(session.actual_start_time),
        isGeofenceOut: fueAutoCheckout,
      };
    });

    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; }
            .title { font-size: 26px; font-weight: 800; color: #000; letter-spacing: 2px; text-transform: uppercase; }
            .subtitle { font-size: 11px; color: #D4AF37; text-transform: uppercase; margin-top: 5px; letter-spacing: 1px; }

            .info-grid { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f8f8f8; padding: 15px; border-radius: 8px; }
            .info-col { width: 48%; }
            .info-label { font-size: 9px; color: #999; text-transform: uppercase; font-weight: bold; margin-bottom: 2px; }
            .info-value { font-size: 13px; color: #000; font-weight: 600; margin-bottom: 10px; }

            .stats-box { display: flex; justify-content: space-between; margin-bottom: 30px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
            .stat-item { flex: 1; text-align: center; padding: 15px; border-right: 1px solid #eee; }
            .stat-item:last-child { border-right: none; background: #fffcf2; }
            .stat-num { font-size: 22px; font-weight: bold; color: #000; }
            .stat-desc { font-size: 9px; color: #666; text-transform: uppercase; margin-top: 5px; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 11px; }
            th { text-align: left; border-bottom: 2px solid #000; padding: 10px; text-transform: uppercase; font-size: 9px; color: #666; }
            td { border-bottom: 1px solid #eee; padding: 12px 10px; vertical-align: top; }
            .row-active { background-color: #fff8e1; }

            .client-badge { background: #000; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; text-transform: uppercase; display: inline-block; margin-bottom: 4px; }
            .notes { font-style: italic; color: #666; font-size: 10px; display: block; margin-top: 4px; }
            .geo-badge-in { color: #2ecc71; font-size: 9px; font-weight: bold; display: block; margin-top: 2px; }
            .geo-badge-out { color: #e67e22; font-size: 9px; font-weight: bold; display: block; margin-top: 2px; }
            .lunch-badge { color: #e67e22; font-size: 9px; }

            .audit-section { margin-top: 20px; border-top: 3px solid #eee; padding-top: 20px; page-break-inside: avoid; }
            .audit-title { font-size: 12px; font-weight: bold; color: #000; text-transform: uppercase; margin-bottom: 15px; }
            .log-item { font-size: 9px; color: #555; margin-bottom: 6px; border-left: 2px solid #ddd; padding-left: 10px; }
            .log-alert { border-left-color: #D4AF37; color: #000; background: #fffcf0; padding: 5px 10px; }

            .footer { margin-top: 50px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">LED TRACKER</div>
            <div class="subtitle">Reporte Oficial de Nómina y Auditoría</div>
          </div>

          <div class="info-grid">
            <div class="info-col">
              <div class="info-label">Empleado</div>
              <div class="info-value">${escapeHtml(settings.employee_name || "No especificado")}</div>
              <div class="info-label">ID Sistema</div>
              <div class="info-value">EMP-#${settings.id.toString().padStart(4, "0")}</div>
            </div>
            <div class="info-col" style="text-align: right;">
              <div class="info-label">Empresa</div>
              <div class="info-value">${escapeHtml(settings.employer_name || "LEON'S ELECTRICAL DESIGN")}</div>
              <div class="info-label">Rango del Reporte</div>
              <div class="info-value">${rangeTitle}</div>
            </div>
          </div>

          <div class="stats-box">
            <div class="stat-item">
              <div class="stat-num">${totalHours.toFixed(2)}</div>
              <div class="stat-desc">Horas Totales</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${totalOvertime.toFixed(2)}</div>
              <div class="stat-desc">Horas Extra (OT)</div>
            </div>
            <div class="stat-item">
              <div class="stat-num" style="color: #D4AF37;">${formatCurrency(totalEarnings)}</div>
              <div class="stat-desc">Pago Estimado</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th width="15%">Fecha</th>
                <th width="40%">Actividad / Cliente</th>
                <th width="25%">Horario</th>
                <th width="10%">Hrs</th>
                <th width="10%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row: ReportRow) => `
                <tr class="${row.status === "ACTIVE_WORK" ? "row-active" : ""}">
                  <td>
                    <strong>${row.date}</strong>
                    ${row.lunch === "Sí" ? '<br><span class="lunch-badge">Lunch: -1h</span>' : ""}
                  </td>
                  <td>
                    ${row.client !== "General" ? `<span class="client-badge">${row.client}</span><br>` : ""}
                    ${row.address}
                    ${row.notes ? `<span class="notes">"${row.notes}"</span>` : ""}
                  </td>
                  <td>
                    ${row.start} - ${row.end}
                    ${row.isGeofenceIn ? '<span class="geo-badge-in">✓ Auto Check-in (GPS)</span>' : ""}
                    ${row.isGeofenceOut ? '<span class="geo-badge-out">⚠ Auto Check-out (GPS)</span>' : ""}
                  </td>
                  <td><strong>${row.total}</strong></td>
                  <td>${row.pay}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>

          <div class="audit-section">
            <div class="audit-title">Registro de Eventos Críticos (GPS & Sistema)</div>
            ${
              logs.length === 0
                ? '<div style="font-size:10px; color:#999;">Sin eventos registrados en este periodo.</div>'
                : logs
                    .map(
                      (auditLog: AuditLog) => `
                <div class="log-item ${auditLog.action_type.includes("AUTO") || auditLog.action_type.includes("EXIT") ? "log-alert" : ""}">
                  <strong>${formatTime(auditLog.timestamp)}</strong> — <span style="font-weight:bold">[${auditLog.action_type}]</span> ${escapeHtml(auditLog.details)}
                </div>
              `,
                    )
                    .join("")
            }
          </div>

          <div class="footer">
            Documento generado electrónicamente por LED Tracker App.<br>
            Certificado digitalmente: ${dayjs().tz().format("YYYY-MM-DD HH:mm:ss Z")}
          </div>
        </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html, base64: false });

    if (shouldShare) {
      log("VERDE", "OPERACION_EXITOSA", "INFO", "Reporte PDF compartido con éxito");
      await Sharing.shareAsync(uri, {
        UTI: ".pdf",
        mimeType: "application/pdf",
      });
    }

    return uri;
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al generar el reporte PDF semanal", error);
    return null;
  }
};

export const sendReportByEmail = async (pdfUri: string, settings: AppSettings) => {
  const isAvailable = await MailComposer.isAvailableAsync();

  if (isAvailable) {
    await MailComposer.composeAsync({
      recipients: [settings.company_email],
      subject: `Nómina Semanal - ${settings.employee_name}`,
      body: `Hola,\n\nAdjunto encontrarás mi reporte de horas y actividades detallado.\n\nPeriodo finalizado.\n\nAtentamente,\n${settings.employee_name}`,
      attachments: [pdfUri],
    });
  } else {
    await Sharing.shareAsync(pdfUri);
  }
};
