import { useCallback, useEffect, useMemo, useState } from "react";
import { persistenceService } from "../../../services/PersistenceService";
import {
  payrollEngineService,
  CALIFORNIA_DAILY_OT_WEEKLY_40,
} from "../../../services/PayrollEngineService";
import { evidencePackService } from "../../../services/EvidencePackService";
import { reportService } from "../../../services/ReportService";
import type {
  PayrollStatement,
  SessionRecord,
  LedgerEntry,
  EvidencePack,
} from "../../contracts/domain";

export type ReportPeriodKey = "CURRENT_WEEK" | "PREVIOUS_WEEK";

function startOfWeek(referenceMs: number): number {
  const d = new Date(referenceMs);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

export function periodBounds(period: ReportPeriodKey): { start: number; end: number } {
  const currentStart = startOfWeek(Date.now());
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (period === "PREVIOUS_WEEK") {
    return { start: currentStart - weekMs, end: currentStart };
  }
  return { start: currentStart, end: currentStart + weekMs };
}

/**
 * useReportsCenter — centro de expedientes (app/(tabs)/reports.tsx,
 * app/report/[periodId].tsx, app/report/pack/[packId].tsx). Ninguna de estas
 * pantallas llama expo-print ni PayrollEngineService directamente: todo pasa
 * por este hook, que delega en PayrollEngineService/EvidencePackService/
 * ReportService.
 */
export function useReportsCenter(period: ReportPeriodKey) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [statement, setStatement] = useState<PayrollStatement | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);

  const { start, end } = periodBounds(period);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await persistenceService.listSessionRecords({ includeClosed: true });
      const inPeriod = all.filter(
        (s) => !s.isDeleted && s.declaredStartAtMs >= start && s.declaredStartAtMs < end,
      );
      setSessions(inPeriod);

      const computed = await payrollEngineService.computeStatement({
        sessions: inPeriod,
        policy: CALIFORNIA_DAILY_OT_WEEKLY_40,
        periodStart: start,
        periodEnd: end,
      });
      setStatement(computed);

      const entriesPerSession = await Promise.all(
        inPeriod.map((s) => persistenceService.listLedgerEntriesForSession(s.id)),
      );
      setLedgerEntries(entriesPerSession.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasConflict = useMemo(
    () => sessions.some((s) => s.integrityClass === "CONFLICT"),
    [sessions],
  );

  const sealPack = useCallback(async (): Promise<EvidencePack | null> => {
    if (!statement) return null;
    // dwellMinutes es una aproximación a partir de horas trabajadas por
    // sitio; el detalle de traza cruda no se incluye en el pack por diseño
    // (Propuesta 5.10: "no necesariamente todos los puntos crudos").
    const bySite = new Map<string, number>();
    sessions.forEach((s) => {
      if (!s.siteId || !s.actualStartAtMs || !s.endAtMs) return;
      const hours = (s.endAtMs - s.actualStartAtMs - (s.totalPausedMs ?? 0)) / (1000 * 60 * 60);
      bySite.set(s.siteId, (bySite.get(s.siteId) ?? 0) + Math.max(0, hours) * 60);
    });
    const traceSummary = Array.from(bySite.entries()).map(([siteId, dwellMinutes]) => ({
      siteId,
      dwellMinutes,
    }));

    return evidencePackService.buildPack({ statement, ledgerEntries, traceSummary });
  }, [statement, sessions, ledgerEntries]);

  const shareEmployeeReceipt = useCallback(async (): Promise<string | null> => {
    if (!statement) return null;
    return reportService.renderEmployeeReceipt(statement);
  }, [statement]);

  const shareEmployerDossier = useCallback(async (): Promise<string | null> => {
    if (!statement) return null;
    return reportService.renderEmployerDossier(statement, ledgerEntries);
  }, [statement, ledgerEntries]);

  return {
    loading,
    error,
    sessions,
    statement,
    ledgerEntries,
    hasConflict,
    periodStart: start,
    periodEnd: end,
    refresh,
    sealPack,
    shareEmployeeReceipt,
    shareEmployerDossier,
  };
}

/** Lectura de un pack ya sellado (app/report/pack/[packId].tsx). */
export function usePackDetail(packId: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<EvidencePack | null>(null);

  const refresh = useCallback(async () => {
    if (!packId) {
      setPack(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const found = await evidencePackService.getPack(packId);
      setPack(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportJson = useCallback(async () => {
    if (!pack) return null;
    return evidencePackService.exportPack(pack, "json");
  }, [pack]);

  const exportEmployerPdf = useCallback(
    async (ledgerEntries: LedgerEntry[]) => {
      if (!pack) return null;
      return evidencePackService.exportPack(pack, "pdf", ledgerEntries);
    },
    [pack],
  );

  return { loading, error, pack, refresh, exportJson, exportEmployerPdf };
}
