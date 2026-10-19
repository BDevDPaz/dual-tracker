/**
 * Muestras del comprobante v2 (no son expedientes sellados).
 *   npx tsx scripts/sample-comprobantes.ts
 * Escribe HTML y, si hay Chrome, PDF en artifacts/comprobantes/.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CompanyPolicy, PayrollStatement, SessionRecord, Site } from "../src/core/contracts";
import { renderEmployeeReceipt, renderEmployerDossier, type ReportInput } from "../src/services/evidence/reportTemplates";
import { formatDate, getWeekEnd, getWeekStart } from "../src/utils/dateUtils";

const OUT = resolve(process.env.COMPROBANTES_OUT ?? "/opt/cursor/artifacts/comprobantes");
const MONDAY = Date.UTC(2026, 8, 21, 15, 0, 0);
const HASH = "ab".repeat(32);
const HOUR = 3_600_000;

const company = {
  employerName: "Taller Norte",
  companyEmail: "rrhh@taller.test",
  overtimeMultiplier: 1.5,
  overtimePolicyId: "CA_DAILY8_WEEKLY40_v1",
  defaultRadiusM: 100,
  destinationLimit: 12,
  traceRetentionDays: 60,
  traceMode: "PERIMETER",
  exitDebounceMs: 60_000,
  exitDecisionWindowMs: 60_000,
  exitDecisionExpiry: "AUTO_IF_CONFIRMED_OUTSIDE",
  transitPaid: true,
  transitRateMultiplier: 1,
  transitCountsTowardOvertime: true,
  payrollLegalFlags: { caDoubleTime: false, caSeventhDay: false, transitionWeeklyThreshold: "FULL" },
} as CompanyPolicy;

function session(id: number, start: number, hours: number, integrity: SessionRecord["integrityClass"], note: string | null): SessionRecord {
  return {
    id,
    declaredStartAtMs: start,
    actualStartAtMs: start,
    endAtMs: start + hours * HOUR,
    domainStatus: "CERRADA",
    siteId: 1,
    clientId: null,
    lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: 0 },
    totalPausedMs: 0,
    transitSegments: [],
    integrityClass: integrity,
    policyId: company.overtimePolicyId,
    bookkeeping: {
      dateString: "2026-09-21",
      isDeleted: false,
      cancelled: false,
      lastPauseStartMs: null,
      firstExitAtMs: null,
      firstExitReliable: null,
      integrityReason: integrity === "VALID" ? "CLEAN" : "MANUAL_PATCH",
      original: null,
      manualNote: note,
      updatedAtMs: start,
    },
  };
}

const sites: Site[] = [
  {
    id: 1,
    alias: "Obra Norte",
    address: "604 W Huntington Dr",
    clientName: null,
    notes: null,
    targetLat: 34.0522,
    targetLon: -118.2437,
    radiusM: 100,
    active: true,
    createdAtMs: 0,
    archivedAtMs: null,
  },
];

function statement(): PayrollStatement {
  return {
    periodStart: getWeekStart(MONDAY),
    periodEnd: getWeekEnd(MONDAY),
    lines: [
      { sessionId: 1, dateString: "2026-09-21", siteId: 1, kind: "REGULAR", minutes: 480, rate: 35, amount: 280, warnings: [] },
      { sessionId: 1, dateString: "2026-09-21", siteId: 1, kind: "OVERTIME_DAILY", minutes: 60, rate: 52.5, amount: 52.5, warnings: [] },
      { sessionId: 2, dateString: "2026-09-22", siteId: 1, kind: "TRANSIT", minutes: 30, rate: 35, amount: 17.5, warnings: [] },
    ],
    regularHours: 8,
    overtimeHours: 1,
    transitHours: 0.5,
    lunchMinutes: 30,
    grossEstimate: 350,
    integrityRollup: { total: 2, byClass: { VALID: 1, MANUAL: 1, AUTO: 0, CONFLICT: 0 }, hasConflict: false, certified: true },
    policyId: company.overtimePolicyId,
    packHash: HASH,
    overtimeDailyHours: 1,
    overtimeWeeklyHours: 0,
    deductionMinutes: 30,
    sessionIds: [1, 2],
    warnings: [],
    appliedRules: ["CA_DOUBLE_TIME_12H"],
  };
}

function input(partial: Partial<ReportInput> = {}): ReportInput {
  const st = statement();
  return {
    statement: st,
    evidence: {
      ledgerEntryCount: 6,
      ledgerHeadHash: "e".repeat(64),
      ledgerChainValid: true,
      ledgerHashes: [{ id: 4, sessionId: 1, hash: "c".repeat(64) }],
      traces: [
        {
          sessionId: 1,
          pointCount: 2,
          firstAtMs: MONDAY,
          lastAtMs: MONDAY + 9 * HOUR,
          unreliableCount: 0,
          dwellBySite: [],
          enterExit: [
            { type: "ENTER", timestampMs: MONDAY, reliable: true },
            { type: "EXIT", timestampMs: MONDAY + 9 * HOUR, reliable: true },
          ],
        },
      ],
      conflicts: [],
    },
    manifest: {
      packId: "W2026-09-21-muestra",
      packHash: HASH,
      sealedAtMs: MONDAY + 10 * HOUR,
      certified: true,
      policyId: st.policyId,
      manifestVersion: 4,
      documentVersion: 2,
      documentTheme: "light",
      documentLocale: "es",
      signature: { algorithm: "Ed25519", keyId: "ed25519:muestra01", publicKey: "cA", value: "c2ln" },
    },
    sessions: [session(1, MONDAY, 9, "VALID", "Llegué y confirmé 🇸🇻"), session(2, MONDAY + 24 * HOUR, 0.5, "MANUAL", null)],
    sites,
    profile: { employeeName: "Ana Ríos", hourlyRate: 35, language: "es", dailyReminderTime: "07:00" },
    company,
    ledger: [
      {
        id: 4,
        sessionId: 1,
        timestampMs: MONDAY + 9 * HOUR,
        actor: "USER",
        intent: "CLOSE_DAY",
        fromState: "ACTIVA",
        toState: "CERRADA",
        reason: "CLOSE",
        integrityClass: "VALID",
        hash: "c".repeat(64),
        prevHash: "d".repeat(64),
      },
    ],
    ...partial,
  };
}

const samples: { name: string; html: string }[] = [
  { name: "comprobante-empleado-claro-es", html: renderEmployeeReceipt(input()) },
  {
    name: "comprobante-empleado-oscuro-en",
    html: renderEmployeeReceipt(
      input({
        manifest: { ...input().manifest, documentTheme: "dark", documentLocale: "en", signature: undefined, sealWarnings: [{ code: "PACK_UNSIGNED", sessionIds: [] }] },
        profile: { employeeName: "Ana Rios", hourlyRate: 35, language: "en", dailyReminderTime: "07:00" },
      }),
    ),
  },
  {
    name: "expediente-anexos-es",
    html: renderEmployerDossier(input({ annex: { ledger: true, enterExit: true } })),
  },
  { name: "comprobante-practica-es", html: renderEmployeeReceipt(input({ practice: true })) },
];

mkdirSync(OUT, { recursive: true });
const chrome = ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find((p) => {
  try {
    execFileSync(p, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

for (const sample of samples) {
  const htmlPath = resolve(OUT, `${sample.name}.html`);
  writeFileSync(htmlPath, sample.html);
  if (!chrome) continue;
  const pdfPath = resolve(OUT, `${sample.name}.pdf`);
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, htmlPath], {
    stdio: "ignore",
  });
}

console.log(`Muestras en ${OUT} (${formatDate(MONDAY, { lang: "es" })}). Chrome: ${chrome ?? "no"}`);
