/**
 * Comparte un diagnóstico de soporte. Solo caché (nunca documents/packs)
 * y solo el JSON ya filtrado por buildSupportDiagnostic.
 */
import { Directory, File, Paths } from "expo-file-system";
import { APP_VERSION } from "../../../constants/app";
import type { IntentResult } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { buildSupportDiagnostic, diagnosticIsSafe } from "../../../support/diagnostic";
import { readBuildLabel } from "../../../support/buildLabel";
import { dismissedTipIds } from "../../../support/tips";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { ReportService } from "../../evidence/ReportService";
import { LoggingService } from "../../persistence/LoggingService";

export async function exportSupportDiagnostic(): Promise<IntentResult<{ uri: string }>> {
  const state = Store.getState();
  const doc = buildSupportDiagnostic({
    nowMs: TimeAuthorityService.now(),
    appVersion: APP_VERSION,
    build: readBuildLabel(),
    settings: state.settings,
    health: state.health,
    tipsDismissed: dismissedTipIds(),
  });
  if (!diagnosticIsSafe(doc)) return { ok: false, code: "REDACTION_FAILED" };
  const json = JSON.stringify(doc, null, 2);
  if (!diagnosticIsSafe(JSON.parse(json))) return { ok: false, code: "REDACTION_FAILED" };
  const dir = new Directory(Paths.cache, "support");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, "dual-tracker-support-diagnostic.json");
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  const shared = await ReportService.shareJson(file.uri);
  if (!shared) return { ok: false, code: "SHARE_UNAVAILABLE" };
  LoggingService.log("VERDE", "OPERACION_EXITOSA", "INFO", "diagnóstico de soporte compartido");
  return { ok: true, data: { uri: file.uri } };
}
