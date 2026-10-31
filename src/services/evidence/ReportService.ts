/**
 * ReportService — Evidencia (Propuesta Técnica §4.5)
 * Fusiona PDFService (proyecto fuente anterior W Tracker), ReportGenerator
 * (proyectos fuente anteriores GEOTrack y LEDTracker) y
 * reportsAdapter (GEOTrack).
 * ============================================================================
 *  - NO calcula overtime: recibe un PayrollStatement ya cerrado por
 *    PayrollEngine y un EvidenceSummary del ledger.
 *  - Dos plantillas: Comprobante del empleado y Expediente del empleador.
 *  - El PDF se mueve de la caché de expo-print a documents/packs/<packId>/
 *    con nombre seguro: es un ARTEFACTO, no un HTML desechable.
 *  - Compartir (expo-sharing) y correo (expo-mail-composer) portados de
 *    generateWeeklyReport / sendReportByEmail.
 */
import { Directory, File, Paths } from "expo-file-system";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { safeFileName } from "../../utils/safeFileName";
import { serializeError } from "../../utils/serializeError";
import { LoggingService } from "../persistence/LoggingService";
import type { ReportInput } from "./reportTemplates";
import { renderEmployeeReceipt, renderEmployerDossier } from "./reportTemplates";

export interface RenderPdfOptions {
  /** `cache` pinta una copia (anexos al exportar) y no toca el PDF sellado. `attempt` escribe en un directorio de un solo intento. */
  destination?: "pack" | "cache" | "attempt";
  /** Obligatorio si destination es `attempt`. */
  attemptId?: string;
}

export type ReportRole = "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER";

function packDirectory(packId: string): Directory {
  const dir = new Directory(Paths.document, "packs", safeFileName(packId, "d").replace(/\.d$/, ""));
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function cacheDirectory(): Directory {
  const dir = new Directory(Paths.cache, "exports");
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function attemptFolderName(attemptId: string): string {
  return safeFileName(attemptId, "d").replace(/\.d$/, "");
}

/** Directorio de un intento de sello. No es el pack hasta que la transacción commitea. */
function attemptDirectory(attemptId: string): Directory {
  const dir = new Directory(Paths.document, "packs", ".pending", attemptFolderName(attemptId));
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function artifactDirectory(packId: string, opts?: RenderPdfOptions): Directory {
  if (opts?.destination === "cache") return cacheDirectory();
  if (opts?.destination === "attempt" && opts.attemptId) return attemptDirectory(opts.attemptId);
  return packDirectory(packId);
}

export const ReportService = {
  renderHtml(role: ReportRole, input: ReportInput): string {
    return role === "EMPLOYEE_RECEIPT" ? renderEmployeeReceipt(input) : renderEmployerDossier(input);
  },

  /** Genera el PDF y lo guarda como artefacto. Devuelve { uri, name }. */
  async renderPdf(role: ReportRole, input: ReportInput, opts?: RenderPdfOptions): Promise<{ uri: string; name: string }> {
    const html = ReportService.renderHtml(role, input);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const cache = opts?.destination === "cache";
    const name = safeFileName(
      `DualTracker_${role === "EMPLOYEE_RECEIPT" ? "Comprobante" : "Expediente"}_${input.manifest.packId}${cache ? "_export" : ""}`,
      "pdf",
    );
    const target = new File(artifactDirectory(input.manifest.packId, opts), name);
    if (target.exists) target.delete();
    new File(uri).move(target);
    LoggingService.log("VERDE", "OPERACION_EXITOSA", "INFO", `PDF ${role} generado`, { packId: input.manifest.packId });
    return { uri: target.uri, name };
  },

  /** Borra el directorio de un intento de sello. No toca otros packs. */
  discardAttempt(attemptId: string): void {
    const dir = new Directory(Paths.document, "packs", ".pending", attemptFolderName(attemptId));
    if (dir.exists) dir.delete();
  },

  /** Escribe el manifiesto JSON junto a los PDF. */
  writeJson(packId: string, fileName: string, json: string, opts?: { attemptId?: string }): { uri: string; name: string } {
    const name = safeFileName(fileName, "json");
    const folder = opts?.attemptId ? attemptDirectory(opts.attemptId) : packDirectory(packId);
    const f = new File(folder, name);
    if (f.exists) f.delete();
    f.create();
    f.write(json);
    return { uri: f.uri, name };
  },

  async share(uri: string): Promise<boolean> {
    try {
      if (!(await Sharing.isAvailableAsync())) return false;
      await Sharing.shareAsync(uri, { UTI: "com.adobe.pdf", mimeType: "application/pdf" });
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al compartir PDF", serializeError(error));
      return false;
    }
  },

  /** Comparte un JSON (informe de incidente del ledger, spec v1.3 §5.5). */
  async shareJson(uri: string): Promise<boolean> {
    try {
      if (!(await Sharing.isAvailableAsync())) return false;
      await Sharing.shareAsync(uri, { UTI: "public.json", mimeType: "application/json" });
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al compartir JSON", serializeError(error));
      return false;
    }
  },

  /** Correo al email de empresa (portado de sendReportByEmail). Cae a compartir si no hay cliente. */
  async email(uris: string[], to: string, employeeName: string, subjectSuffix: string): Promise<boolean> {
    if (!(await MailComposer.isAvailableAsync())) {
      return uris.length ? ReportService.share(uris[0]) : false;
    }
    const composed = await MailComposer.composeAsync({
      recipients: to ? [to] : [],
      subject: `Nómina ${subjectSuffix} - ${employeeName}`,
      body: `Hola,\n\nAdjunto el expediente de horas del periodo.\n\nAtentamente,\n${employeeName}`,
      attachments: uris,
    });
    return composed.status === "sent";
  },
};
