/**
 * Tramos tal como quedan en el expediente (JSON y anexo del PDF).
 * Incluye los recortados: el clip es la prueba del ajuste manual.
 */
import type { CompanyPolicy, SessionRecord, TransitSegmentExport } from "../../core/contracts";
import { TransitPolicyService } from "./TransitPolicyService";

export function exportSessionTransits(session: SessionRecord, company: CompanyPolicy): TransitSegmentExport[] {
  const boundStart = session.actualStartAtMs ?? session.declaredStartAtMs;
  const boundEnd = session.endAtMs ?? boundStart;
  return session.transitSegments.map((t) => {
    const decision = TransitPolicyService.decide(t, company);
    const row: TransitSegmentExport = {
      sessionId: session.id,
      id: t.id,
      fromSiteId: t.fromSiteId,
      toSiteId: t.toSiteId,
      startAtMs: t.startAtMs,
      endAtMs: t.endAtMs,
      cancelled: t.cancelled,
      paid: decision.paid,
      minutes: TransitPolicyService.boundedMinutes(t, boundStart, boundEnd),
    };
    if (t.cancelNote) row.cancelNote = t.cancelNote;
    if (t.clip) row.clip = { ...t.clip };
    return row;
  });
}
