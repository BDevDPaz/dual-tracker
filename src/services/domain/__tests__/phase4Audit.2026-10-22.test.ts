/**
 * Fase 4 de la auditoría 22 oct 2026: cobertura de monitoreo, avisos críticos,
 * reconstrucción de minutos desde el libro, índice de prev_hash, tope de
 * segmentación, espera de llegada y reanudación tras reinicio.
 * La nómina, la máquina de la jornada y el hash de asientos ya escritos no cambian.
 */
import * as Print from "expo-print";
import { monitoringCoverage } from "../../../core/monitoringCoverage";
import { DOCUMENT_VERSION, PACK_MANIFEST_VERSION } from "../../../core/contracts";
import { setLanguage, t } from "../../../i18n";
import { companyCalendar } from "../../../utils/companyPolicy";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { COMPANY, HOUR, MIN, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { SITE_LAT, SITE_LON } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { EvidencePackService, computeContentHash, contentOf } from "../../evidence/EvidencePackService";
import { ReportService } from "../../evidence/ReportService";
import { LEDGER_PAYLOAD_VERSION, IntegrityLedgerService } from "../IntegrityLedgerService";
import { PayrollEngineService } from "../PayrollEngineService";
import { compareSessionsToLedger } from "../sessionReplay";
import { SEGMENT_GUARD, segmentInterval } from "../segmentation";
import { ensureUniquePrevHash, PersistenceService } from "../../persistence/PersistenceService";
import { LoggingService } from "../../persistence/LoggingService";
import { SettingsService } from "../../persistence/SettingsService";
import { KV_KEYS } from "../../persistence/schema";
import { DISPLAY_LIMIT, recordCriticalNotice } from "../../runtime/criticalNotices";
import { setDeviceUptimeReader } from "../../runtime/deviceUptime";
import { touchHeartbeat } from "../../runtime/heartbeat";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { noteBootResume } from "../../runtime/bootResume";
import { NotificationService } from "../../runtime/NotificationService";
import type { LedgerIntent, SessionRecord } from "../../../core/contracts";

function dataOf(payloadJson: string): Record<string, unknown> {
  return JSON.parse(payloadJson).data;
}

async function append(session: SessionRecord, intent: LedgerIntent, data: Record<string, unknown>, atMs = time.now()): Promise<void> {
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId: session.id,
        actor: "SYSTEM",
        intent,
        fromState: session.domainStatus,
        toState: session.domainStatus,
        reason: intent,
        timestampMs: atMs,
        integrityClass: null,
        data,
      },
      db,
    );
  });
}

describe("Fase 4 — cobertura, libro y reanudación", () => {
  beforeEach(() => PersistenceService.init());
  afterEach(() => setDeviceUptimeReader(null));

  test("la cobertura une huecos solapados y sin eventos es 100%", () => {
    const start = 0;
    const end = 10 * MIN;
    expect(monitoringCoverage({ startMs: start, endMs: end }, []).coveragePercent).toBe(100);
    expect(monitoringCoverage({ startMs: start, endMs: start }, []).coveragePercent).toBeNull();
    const overlapped = monitoringCoverage(
      { startMs: start, endMs: end },
      [
        { intent: "MONITORING_GAP", timestampMs: 4 * MIN, data: { lastHeartbeatMs: 1 * MIN } },
        { intent: "GPS_LOST", timestampMs: 2 * MIN, data: { lastFixMs: 1 * MIN } },
        { intent: "GPS_RESTORED", timestampMs: 5 * MIN, data: {} },
        { intent: "SERVICE_RECOVERY_FAILED", timestampMs: 8 * MIN, data: {} },
      ],
    );
    expect(overlapped.unmonitoredMs).toBe(4 * MIN + 2 * MIN);
    expect(overlapped.coveragePercent).toBe(40);
  });

  test("un aviso crítico no afirma que Android lo mostró, y el toque sí queda anotado", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(await NotificationService.notifyExitDetected(session.id, time.now())).toBe(true);
    expect(await NotificationService.notifyExitDetected(session.id, time.now())).toBe(true);
    const posted = (await IntegrityLedgerService.listForSession(session.id)).filter((row) => row.intent === "NOTIFICATION_POSTED");
    expect(posted).toHaveLength(1);
    expect(dataOf(posted[0].payloadJson)).toMatchObject({
      kind: "EXIT",
      phase: "CREATED",
      channel: "OS_NOTIFICATION",
      acceptedByOs: true,
      displayConfirmed: false,
      displayLimit: DISPLAY_LIMIT,
      feedbackShown: false,
      userAcknowledged: false,
    });
    await recordCriticalNotice({
      sessionId: session.id,
      kind: "EXIT",
      phase: "ACKNOWLEDGED",
      channel: "OS_NOTIFICATION",
      feedbackShown: true,
      userAcknowledged: true,
    });
    const ack = (await IntegrityLedgerService.listForSession(session.id)).find((row) => row.intent === "NOTIFICATION_ACKNOWLEDGED");
    expect(dataOf(ack!.payloadJson)).toMatchObject({ userAcknowledged: true, feedbackShown: true, displayConfirmed: false });
    expect(ack?.actor).toBe("USER");
  });

  test("el libro reconstruye los minutos; un end_ms alterado es hallazgo y no cambia el pago", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA);
    const arrival = (await IntegrityLedgerService.listForSession(open.id)).find((row) => row.intent === "NOTIFICATION_POSTED");
    expect(dataOf(arrival!.payloadJson)).toMatchObject({ kind: "ARRIVAL", displayConfirmed: false, channel: "IN_APP" });
    time.travel(4 * HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(30 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(3 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const gapAt = (closed.actualStartAtMs ?? closed.declaredStartAtMs) + HOUR;
    await append(closed, "MONITORING_GAP", { lastHeartbeatMs: gapAt, gapSeconds: 3600 }, gapAt + HOUR);
    await append(closed, "GPS_LOST", { lastFixMs: gapAt }, gapAt);
    await append(closed, "GPS_RESTORED", {}, gapAt + HOUR);

    const settings = await SettingsService.load();
    const replay = compareSessionsToLedger([closed], await PersistenceService.listLedger(), settings.company, time.now());
    expect(replay).toEqual([expect.objectContaining({ sessionId: closed.id, status: "MATCH" })]);

    const period = { periodStart: getWeekStart(closed.actualStartAtMs!), periodEnd: getWeekEnd(closed.actualStartAtMs!) };
    const packed = await EvidencePackService.seal(period);
    if (!packed.ok) throw new Error(String(packed.code));
    expect(LEDGER_PAYLOAD_VERSION).toBe(2);
    expect(packed.data.manifest.manifestVersion).toBe(PACK_MANIFEST_VERSION);
    expect(packed.data.manifest.documentVersion).toBe(DOCUMENT_VERSION);
    expect(packed.data.evidence.sessionReplay).toEqual([expect.objectContaining({ sessionId: closed.id, status: "MATCH" })]);
    const coverage = packed.data.evidence.monitoringCoverage?.find((row) => row.sessionId === closed.id);
    expect(coverage?.coveragePercent).toBeLessThan(100);
    expect(coverage?.unmonitoredMs).toBe(HOUR);
    expect(await EvidencePackService.verify(packed.data)).toMatchObject({ valid: true, failures: [] });

    const gross = packed.data.statement.grossEstimate;
    const paid = PayrollEngineService.buildStatement({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      sessions: [closed],
      rates: { hourlyRate: 20, overtimeMultiplier: 1.5 },
      company: COMPANY,
      policyId: COMPANY.overtimePolicyId,
      nowMs: time.now(),
    }).grossEstimate;
    expect(gross).toBe(paid);

    await PersistenceService.transaction(async (db) => {
      await db.runAsync(`UPDATE sessions SET end_ms = ? WHERE id = ?`, [(closed.endAtMs ?? 0) - HOUR, closed.id]);
    });
    const verdict = await EvidencePackService.verify(packed.data);
    expect(verdict.failures).toContain("SESSION_REPLAY");
    expect(verdict.valid).toBe(false);
    expect((await PersistenceService.getSession(closed.id))?.endAtMs).toBe((closed.endAtMs ?? 0) - HOUR);
    expect(packed.data.statement.grossEstimate).toBe(gross);
    expect(packed.data.evidence.sessionReplay?.[0].status).toBe("MATCH");

    const html = (Print as unknown as { __printed: string[] }).__printed.join("\n");
    expect(html).toContain('data-monitoring-coverage="1"');
    expect(html).toContain('data-session-replay="1"');
    expect(html).toContain(t("comprobante.coverageTitle", {}, "es"));
    expect(html).toContain(t("comprobante.replayMatch", { id: closed.id }, "es"));
    const render = (locale: "es" | "en", role: "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER" = "EMPLOYEE_RECEIPT") =>
      ReportService.renderHtml(role, {
        statement: packed.data.statement,
        evidence: packed.data.evidence,
        manifest: { ...packed.data.manifest, documentLocale: locale },
        sessions: [closed],
        sites: [],
        profile: { employeeName: "Ada" } as never,
        company: COMPANY,
      });
    expect(render("en")).toContain(t("comprobante.coverageHint", {}, "en"));
    expect(render("en", "EMPLOYER_DOSSIER")).toContain(t("comprobante.replayHint", {}, "en"));
    expect(render("es", "EMPLOYER_DOSSIER")).toContain(t("comprobante.coverageTitle", {}, "es"));
    setLanguage("es");
    expect(render("es")).toContain(t("comprobante.replayTitle", {}, "es"));

    const legacy = contentOf(makeStatement(), makeEvidence());
    expect(JSON.stringify(legacy)).not.toContain("monitoringCoverage");
    expect(JSON.stringify(legacy)).not.toContain("sessionReplay");
    const stripped = { ...packed.data.evidence };
    delete stripped.monitoringCoverage;
    delete stripped.sessionReplay;
    expect(await computeContentHash(packed.data.statement, stripped)).not.toBe(packed.data.manifest.contentHash);
    expect(JSON.stringify(contentOf(packed.data.statement, stripped))).not.toContain("monitoringCoverage");
  });

  test("el índice único de prev_hash se crea, y se omite si ya hay duplicados", async () => {
    await PersistenceService.init();
    const created = await PersistenceService.transaction(async (db) => {
      const status = await ensureUniquePrevHash(db);
      const row = await db.getFirstAsync<{ name: string }>(`SELECT name AS name FROM sqlite_master WHERE type = 'index' AND name = 'idx_ledger_prev_hash'`);
      return { status, name: row?.name ?? null };
    });
    expect(created).toEqual({ status: "created", name: "idx_ledger_prev_hash" });

    await PersistenceService.transaction(async (db) => {
      await db.execAsync(`DROP INDEX IF EXISTS idx_ledger_prev_hash`);
      await db.runAsync(
        `INSERT INTO ledger_entries (session_id, prev_hash, hash, actor, intent, from_state, to_state, reason, timestamp_ms, payload_json, integrity_class) VALUES (NULL, ?, ?, 'SYSTEM', 'BOOT_RESUME', NULL, NULL, 'DUP', 1, '{}', NULL)`,
        ["prev-dup", "hash-dup-1"],
      );
      await db.runAsync(
        `INSERT INTO ledger_entries (session_id, prev_hash, hash, actor, intent, from_state, to_state, reason, timestamp_ms, payload_json, integrity_class) VALUES (NULL, ?, ?, 'SYSTEM', 'BOOT_RESUME', NULL, NULL, 'DUP', 2, '{}', NULL)`,
        ["prev-dup", "hash-dup-2"],
      );
    });
    const spy = jest.spyOn(LoggingService, "log");
    const status = await PersistenceService.transaction(async (db) => ensureUniquePrevHash(db));
    expect(status).toBe("skipped-duplicates");
    expect(spy).toHaveBeenCalledWith("ROJO", "INTEGRIDAD_COMPROMETIDA", "ERROR", "prev_hash duplicado: no se crea el índice único", { groups: 1 });
    const index = await PersistenceService.transaction(async (db) => db.getFirstAsync<{ name: string }>(`SELECT name AS name FROM sqlite_master WHERE type = 'index' AND name = 'idx_ledger_prev_hash'`));
    expect(index).toBeNull();
  });

  test("superar 1000 jornadas al segmentar deja constancia y no recorta en silencio", () => {
    const spy = jest.spyOn(LoggingService, "log");
    const start = MONDAY_8AM;
    const end = start + (SEGMENT_GUARD + 5) * 24 * HOUR;
    const segs = segmentInterval(start, end, companyCalendar(COMPANY), "America/Los_Angeles");
    expect(segs).toHaveLength(SEGMENT_GUARD);
    expect(segs[segs.length - 1].endMs).toBeLessThan(end);
    expect(spy).toHaveBeenCalledWith(
      "ROJO",
      "INTEGRIDAD_COMPROMETIDA",
      "ERROR",
      "Segmentación truncada: el intervalo supera el tope de jornadas",
      expect.objectContaining({ guard: SEGMENT_GUARD, segments: SEGMENT_GUARD }),
    );
  });

  test("la espera de llegada en 0 ficha ya; con espera, la hora es la primera lectura", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const immediate = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: time.now() });
    expect((await PersistenceService.getSession(immediate.id))?.domainStatus).toBe("ACTIVA");

    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const settings = await SettingsService.load();
    await SettingsService.saveCompany({ ...settings.company, arrivalDwellMs: 2 * MIN });
    time.travel(MIN);
    const waiting = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const firstAt = time.now();
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: firstAt });
    expect((await PersistenceService.getSession(waiting.id))?.domainStatus).toBe("ESPERANDO");
    expect(await PersistenceService.listSpatialFacts(waiting.id, ["ENTER"])).toHaveLength(1);
    time.travel(MIN);
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: time.now() });
    expect((await PersistenceService.getSession(waiting.id))?.domainStatus).toBe("ESPERANDO");
    time.travel(MIN);
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: time.now() });
    const arrived = await PersistenceService.getSession(waiting.id);
    expect(arrived?.domainStatus).toBe("ACTIVA");
    expect(arrived?.actualStartAtMs).toBe(firstAt);
    expect(await PersistenceService.listSpatialFacts(waiting.id, ["ENTER"])).toHaveLength(1);
    expect(await PersistenceService.getKv(KV_KEYS.ARRIVAL_DWELL)).toBeNull();
  });

  test("un reinicio con reloj de arranque anota BOOT_RESUME una vez; sin reloj no se inventa", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await touchHeartbeat();
    time.travel(60_000);
    setDeviceUptimeReader(async () => 5_000);
    expect(await noteBootResume("geofence", { recover: false })).toBe(true);
    expect(await noteBootResume("worker")).toBe(false);
    const rows = (await IntegrityLedgerService.listForSession(session.id)).filter((row) => row.intent === "BOOT_RESUME");
    expect(rows).toHaveLength(1);
    expect(dataOf(rows[0].payloadJson)).toMatchObject({ origin: "geofence", limit: "EXPO_NO_JS_AT_BOOT_COMPLETED" });
    setDeviceUptimeReader(async () => null);
    time.travel(10 * MIN);
    expect(await noteBootResume("boot")).toBe(false);
    expect((await IntegrityLedgerService.listForSession(session.id)).filter((row) => row.intent === "BOOT_RESUME")).toHaveLength(1);
  });
});
