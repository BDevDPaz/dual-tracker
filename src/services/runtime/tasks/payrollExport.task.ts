/**
 * PAYROLL_EXPORT (Propuesta Técnica §7.2) — fin de semana o manual.
 * Arma el EvidencePack de la semana cerrada. No recalcula con reglas
 * distintas a las del cierre.
 * Ventana portada de BackgroundTasks.ts (GEOTrack): domingo ≥ 20:00 → semana
 * en curso; lunes/martes → semana anterior. Idempotente por semana
 * (KV LAST_PACK_WEEK) y por periodo (EvidencePackService.findForPeriod).
 * Si hay CONFLICT en el periodo NO sella en automático: avisa para revisar.
 */
import { corporateDayAndHour, getWeekEnd, getWeekStart, shiftWeek, weekPeriodId } from "../../../utils/dateUtils";
import { FeedbackService } from "../../application/FeedbackService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";

export async function runPayrollExport(): Promise<string | null> {
  const nowMs = TimeAuthorityService.now();
  const { day, hour } = corporateDayAndHour(nowMs);
  const inWindow = (day === 0 && hour >= 20) || day === 1 || day === 2;
  if (!inWindow) return null;
  const periodStart = day === 0 ? getWeekStart(nowMs) : shiftWeek(getWeekStart(nowMs), -1);
  const periodEnd = getWeekEnd(periodStart);
  const weekId = weekPeriodId(periodStart);
  if (!weekId || !Number.isFinite(periodEnd)) return null;
  if ((await PersistenceService.getKv<string>(KV_KEYS.LAST_PACK_WEEK)) === weekId) return null;
  if (await EvidencePackService.findForPeriod(periodStart, periodEnd)) {
    await PersistenceService.setKv(KV_KEYS.LAST_PACK_WEEK, weekId);
    return null;
  }
  const r = await EvidencePackService.seal({ periodStart, periodEnd, allowUncertified: false });
  if (r.ok && r.data) {
    await PersistenceService.setKv(KV_KEYS.LAST_PACK_WEEK, weekId);
    FeedbackService.emit("PACK_SEALED", { hash: r.data.manifest.packHash.slice(0, 12) });
    return r.data.id;
  }
  if (!r.ok && (r.code === "EMPTY_PERIOD" || r.code === "INVALID_PERIOD")) await PersistenceService.setKv(KV_KEYS.LAST_PACK_WEEK, weekId);
  if (!r.ok) LoggingService.log("AMARILLO", "PAYROLL", "WARN", `Exportación semanal no sellada: ${r.code}`);
  return null;
}
