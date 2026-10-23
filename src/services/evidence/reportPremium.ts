/**
 * Comprobante premium (documentVersion 2).
 * No calcula nómina: pinta el PayrollStatement ya cerrado.
 * El packHash no depende de esta plantilla.
 */
import escapeHtml from "escape-html";
import type { IntegrityClass, PayrollLine, SessionRecord, Site } from "../../core/contracts";
import { t, tWarning, type Language } from "../../i18n";
import { formatCurrency, formatDate, formatDateTime, formatRange, formatTime, type FormatOptions } from "../../utils/dateUtils";
import { companyCalendar } from "../../utils/companyPolicy";
import { displayClockSpanMinutes, displayStatement, formatHundredths, formatSiteName, minutesToHundredths, noteToHtml } from "../domain/payrollDisplay";
import { APP_VERSION } from "../../constants/app";
import { readBuildLabel, readGitCommit } from "../../support/buildLabel";
import { getPayrollPolicy } from "../domain/payrollPolicies";
import { periodSliceOf } from "../domain/periodSlice";
import { checkedInSiteIds } from "../domain/siteVisits";
import { fingerprintFromB64url } from "../runtime/keyFingerprint";
import { verificationQrSvg } from "./qrSvg";
import type { PowerOffNote } from "./deviceOffGap";
import { siteMoveBlock } from "./siteMoves";
import type { ForensicLedgerRow, ReportInput } from "./reportTemplates";

export type PremiumRole = "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER";

const GOLD = "#C5A059";
/** Texto oro sobre blanco del comprobante claro. ≥ 4.5:1; el adorno sigue en GOLD. */
export const PDF_LIGHT_TEXT_GOLD = "#8A6D1F";

const PALETTE = {
  light: {
    bg: "#FFFFFF",
    ink: "#1C1915",
    muted: "#6F675C",
    line: "#E6DFD2",
    card: "#F7F4EE",
    gross: "#FBF6EA",
    hash: "#F4F1EA",
    warnBg: "#FEF5E7",
    warnInk: "#7E5109",
    danger: "#C0392B",
  },
  dark: {
    bg: "#141311",
    ink: "#F4F0E6",
    muted: "#B3AA9C",
    line: "#3A342C",
    card: "#1E1C19",
    gross: "#2A2418",
    hash: "#241F1A",
    warnBg: "#3A2E18",
    warnInk: "#E6C27A",
    danger: "#E07A72",
  },
} as const;

const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="${GOLD}" stroke-width="2.5"/><path d="M20 14 H32 C46 14 52 22 52 32 C52 42 46 50 32 50 H20 Z" fill="none" stroke="${GOLD}" stroke-width="3.2" stroke-linejoin="round"/></svg>`;

function localeOf(input: ReportInput): Language {
  return input.manifest.documentLocale === "en" ? "en" : "es";
}

function themeOf(input: ReportInput): "light" | "dark" {
  return input.manifest.documentTheme === "dark" ? "dark" : "light";
}

/** Misma regla que la plantilla heredada: sin minutos pagados y sin importe. */
function isZeroPayRow(minutes: number, amountCents: number): boolean {
  return minutes <= 0 && amountCents === 0;
}

function css(theme: "light" | "dark"): string {
  const p = PALETTE[theme];
  const goldInk = theme === "light" ? PDF_LIGHT_TEXT_GOLD : GOLD;
  return `
    @page { size: letter; margin: 11mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: ${p.bg}; color: ${p.ink}; padding: 4px; }
    .sheet { position: relative; z-index: 1; }
    .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; }
    .watermark span { font-size: 84px; font-weight: 700; letter-spacing: 8px; color: ${p.ink}; opacity: 0.08; transform: rotate(-18deg); }
    .brand-row { display: flex; align-items: center; gap: 14px; }
    .mark { width: 42px; height: 42px; flex: 0 0 auto; }
    .brand-copy { min-width: 0; flex: 1 1 auto; }
    .brand-name { font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase; color: ${goldInk}; font-weight: 700; }
    .doc-title { font-size: 20px; font-weight: 700; letter-spacing: 0.3px; margin-top: 2px; }
    .stamp-slot { margin-left: auto; flex: 0 0 auto; padding: 14px 16px 8px 10px; }
    .stamp-seal { display: inline-block; white-space:nowrap; border: 2.5px solid ${goldInk}; color: ${goldInk}; font-weight: 800; letter-spacing: 1px; font-size: 12px; line-height: 1; padding: 6px 10px; transform: rotate(-8deg); transform-origin: right center; }
    .gold-rule { height: 2px; background: ${GOLD}; border: 0; margin: 10px 0 12px; }
    .meta { display: flex; gap: 14px; margin-bottom: 12px; }
    .meta-col { width: 50%; background: ${p.card}; border: 1px solid ${p.line}; border-radius: 10px; padding: 10px 12px; }
    .meta-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: ${p.muted}; font-weight: 700; margin-bottom: 2px; }
    .meta-value { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
    .meta-value:last-child { margin-bottom: 0; }
    .sig-box { display: inline-block; border: 1.5px solid ${goldInk}; border-radius: 8px; padding: 8px 12px; margin: 0 0 8px; background: ${p.card}; }
    .sig { font-size: 12px; font-weight: 700; margin: 0; }
    .sig.signed { color: ${goldInk}; }
    .sig.unsigned { color: ${p.danger}; }
    .indicator { font-size: 11px; color: ${p.warnInk}; background: ${p.warnBg}; border: 1px solid ${p.warnInk}; border-radius: 8px; padding: 8px 10px; margin: 0 0 8px; }
    .integrity-line { font-size: 11px; color: ${p.muted}; margin: 0 0 10px; }
    .metrics { display: flex; border: 1px solid ${p.line}; border-radius: 10px; overflow: hidden; margin-bottom: 6px; }
    .metric { flex: 1; padding: 8px 6px; border-right: 1px solid ${p.line}; background: ${p.bg}; }
    .metric:last-child { border-right: none; }
    .metric.gross { background: ${p.gross}; box-shadow: inset 0 0 0 1.5px ${GOLD}; }
    .metric .num { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; text-align: right; }
    .metric.gross .num { color: ${goldInk}; }
    .metric .lbl { font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: ${p.muted}; margin-top: 4px; text-align: right; }
    .lunch-line { font-size: 11px; color: ${p.muted}; margin: 0 0 12px; text-align: right; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: 11px; }
    th { text-align: left; border-bottom: 2px solid ${p.ink}; padding: 7px 6px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.6px; color: ${p.muted}; }
    td { border-bottom: 1px solid ${p.line}; padding: 8px 6px; vertical-align: top; }
    th.fig, td.fig { text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
    .badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .b-VALID { background: #e8f8ef; color: #1e8449; }
    .b-MANUAL { background: #fff4e0; color: #b9770e; }
    .b-AUTO { background: #eaf2fb; color: #2471a3; }
    .b-CONFLICT { background: #fdecea; color: #c0392b; }
    .notes { font-style: italic; color: ${p.muted}; font-size: 11px; display: block; margin-top: 4px; white-space: pre-wrap; overflow-wrap: break-word; }
    .grapheme { white-space: nowrap; display: inline; }
    .addr { display: block; font-size: 11px; color: ${p.muted}; font-weight: normal; margin-top: 2px; }
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 12px 0 6px; }
    .rule { font-size: 11px; margin: 0 0 4px; }
    .muted { color: ${p.muted}; font-size: 11px; line-height: 1.4; }
    .verify { display: flex; gap: 16px; align-items: flex-start; margin-top: 8px; }
    .verify-copy { flex: 1; }
    .hash { font-family: "ui-monospace", "SFMono-Regular", Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; background: ${p.hash}; padding: 8px; border-radius: 6px; }
    .qr-pad { background: #FFFFFF; padding: 4px; border-radius: 8px; line-height: 0; flex: 0 0 auto; }
    .qr { width: 96px; height: 96px; }
    .versions { font-size: 11px; color: ${p.muted}; margin: 8px 0 0; }
    .sheet-tail { break-inside: avoid; page-break-inside: avoid; }
    .footer { margin-top: 8px; text-align: center; font-size: 11px; color: ${p.muted}; border-top: 1px solid ${p.line}; padding-top: 8px; }
    .uncertified { margin: 0 0 12px; padding: 8px; border: 2px dashed ${p.danger}; color: ${p.danger}; font-weight: 700; text-align: center; text-transform: uppercase; font-size: 11px; }
    .annex { break-before: page; page-break-before: always; }
    .mono { font-family: "ui-monospace", "SFMono-Regular", Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; }
  `;
}

function siteAliasHtml(sites: Site[], id: number | null, lang: Language): string {
  if (id === null) return escapeHtml(t("comprobante.noSite", {}, lang));
  const site = sites.find((s) => s.id === id);
  const name = formatSiteName(site);
  if (!name.primary) return escapeHtml(t("comprobante.siteFallback", { id }, lang));
  const primary = escapeHtml(name.primary);
  return name.address ? `${primary}<span class="addr">${escapeHtml(name.address)}</span>` : primary;
}

function sessionSitesLabel(session: SessionRecord, sites: Site[], lang: Language): string {
  const ids = checkedInSiteIds(session);
  if (!ids.length) return siteAliasHtml(sites, session.siteId, lang);
  return ids.map((id) => siteAliasHtml(sites, id, lang)).join(" → ");
}

function integrityKey(cls: string): string {
  if (cls === "VALID") return "comprobante.integrityValid";
  if (cls === "MANUAL") return "comprobante.integrityManual";
  if (cls === "AUTO") return "comprobante.integrityAuto";
  if (cls === "CONFLICT") return "comprobante.integrityConflict";
  return "";
}

/** El rollup sigue contando MANUAL. La fila no dice «Cierre automático» si el operario recuperó el corte. */
function sessionIntegrityLabel(session: SessionRecord, lang: Language): string {
  const reason = session.bookkeeping.integrityReason;
  if (reason === "RECOVERED_CLOSED" || reason === "ORPHAN_CONTINUED" || reason === "ORPHAN_END_CONFIRMED") {
    return t("comprobante.integrityRecovered", {}, lang);
  }
  const key = integrityKey(session.integrityClass);
  return key ? t(key, {}, lang) : session.integrityClass;
}

const MANUAL_EXIT_REASONS = new Set(["MANUAL_ACTION_EXPLICIT", "EXIT_CONFIRMED_BY_USER"]);

/** Minutos del reloj impreso (sin segundos). No sustituye lunchMinutes de la nómina. */
function lunchRangeNote(session: SessionRecord, lang: Language): string {
  const start = session.lunch.startAtMs;
  const end = session.lunch.endAtMs;
  if (start == null || end == null || end < start) return "";
  const fmt: FormatOptions = { lang };
  const text = t(
    "comprobante.lunchRange",
    { from: formatTime(start, fmt), to: formatTime(end, fmt), minutes: displayClockSpanMinutes(start, end) },
    lang,
  );
  return `<span class="notes">${escapeHtml(text)}</span>`;
}

function lineLabel(line: PayrollLine, lang: Language): string {
  if (line.kind === "TRANSIT" && line.transitCancel) {
    const when = formatTime(line.transitCancel.endAtMs, { lang });
    const base = t("comprobante.lineTransitCancelled", {}, lang);
    const note = line.transitCancel.note?.trim();
    return note ? `${base} · ${when} · ${note}` : `${base} · ${when}`;
  }
  const key = {
    REGULAR: "comprobante.lineRegular",
    OVERTIME_DAILY: "comprobante.lineOtDaily",
    OVERTIME_WEEKLY: "comprobante.lineOtWeekly",
    OVERTIME_DOUBLE: "comprobante.lineDouble",
    TRANSIT: "comprobante.lineTransit",
    LUNCH_DEDUCTION: "comprobante.lineLunch",
    PAUSE_DEDUCTION: "comprobante.linePause",
    MEAL_PREMIUM: "comprobante.lineMealPremium",
    REST_PREMIUM: "comprobante.lineRestPremium",
  }[line.kind];
  return t(key, {}, lang);
}

function premiumLinesBlock(input: ReportInput, lang: Language): string {
  const lines = input.statement.lines.filter((l) => l.kind === "MEAL_PREMIUM" || l.kind === "REST_PREMIUM");
  if (!lines.length) return "";
  const rows = lines
    .map(
      (l) =>
        `<tr data-premium="${l.kind}"><td>${escapeHtml(lineLabel(l, lang))}</td><td class="fig">${l.minutes}</td><td class="fig">${escapeHtml(formatCurrency(l.amount))}</td></tr>`,
    )
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.premiumTitle", {}, lang))}</div><table>${rows}</table>`;
}

function headerBlock(input: ReportInput, role: PremiumRole, lang: Language): string {
  const fmt: FormatOptions = { lang };
  const title = t(role === "EMPLOYEE_RECEIPT" ? "comprobante.employeeTitle" : "comprobante.employerTitle", {}, lang);
  const employee = input.profile.employeeName.trim() || t("comprobante.unspecifiedEmployee", {}, lang);
  const employer = input.company.employerName.trim() || t("comprobante.unspecifiedEmployer", {}, lang);
  const doc = input.manifest.documentVersion ?? 2;
  return `
    <div class="brand-row">
      ${MARK}
      <div class="brand-copy">
        <div class="brand-name">Dual Tracker</div>
        <div class="doc-title">${escapeHtml(title)}</div>
      </div>
      <div class="stamp-slot"><div class="stamp-seal">${escapeHtml(t("comprobante.seal", {}, lang))}</div></div>
    </div>
    <div class="gold-rule"></div>
    <div class="meta">
      <div class="meta-col">
        <div class="meta-label">${escapeHtml(t("comprobante.employee", {}, lang))}</div>
        <div class="meta-value">${escapeHtml(employee)}</div>
        <div class="meta-label">${escapeHtml(t("comprobante.employer", {}, lang))}</div>
        <div class="meta-value">${escapeHtml(employer)}</div>
        <div class="meta-label">${escapeHtml(t("comprobante.period", {}, lang))}</div>
        <div class="meta-value">${escapeHtml(formatRange(input.statement.periodStart, input.statement.periodEnd, fmt))}</div>
      </div>
      <div class="meta-col">
        <div class="meta-label">${escapeHtml(t("comprobante.generated", {}, lang))}</div>
        <div class="meta-value">${escapeHtml(formatDateTime(input.manifest.sealedAtMs, fmt))}</div>
        <div class="meta-label">${escapeHtml(t("comprobante.version", {}, lang))}</div>
        <div class="meta-value">${escapeHtml(t("comprobante.versionValue", { doc }, lang))}</div>
      </div>
    </div>`;
}

function signatureBlock(input: ReportInput, lang: Language): string {
  const signature = input.manifest.signature;
  const signed = signature?.algorithm === "Ed25519" && !!signature.keyId;
  const warnings = input.manifest.sealWarnings ?? [];
  const fingerprint = signed && signature ? fingerprintFromB64url(signature.publicKey) : null;
  const line = signed
    ? `<p class="sig signed" data-signature="Ed25519">${escapeHtml(t("comprobante.signed", { keyId: signature.keyId }, lang))}</p>`
    : `<p class="sig unsigned" data-signature="none">${escapeHtml(t("comprobante.unsigned", {}, lang))}</p>`;
  const signatureBox = `<div class="sig-box">${line}</div>`;
  const fingerprintLine = fingerprint
    ? `<p class="sig-fp" data-key-fingerprint="${escapeHtml(fingerprint)}">${escapeHtml(t("comprobante.keyFingerprint", { fingerprint }, lang))}</p>`
    : "";
  const unsigned = !signed || warnings.some((w) => w.code === "PACK_UNSIGNED");
  const indicator = unsigned
    ? `<p class="indicator" data-seal-indicator="unsigned">${escapeHtml(t("comprobante.unsignedIndicator", {}, lang))}</p>`
    : "";
  const crypto = warnings.filter((w) => w.code === "FIELD_CRYPTO_KEY_LOST");
  const cryptoHtml = crypto
    .map((w) => {
      const ids = w.sessionIds.map((id) => `#${id}`).join(", ");
      return `<p class="indicator" data-seal-warning="FIELD_CRYPTO_KEY_LOST">${escapeHtml(t("fieldCrypto.sealWarning", {}, lang))}${
        ids ? `<span class="notes">${escapeHtml(t("comprobante.warningSessions", { ids }, lang))}</span>` : ""
      }</p>`;
    })
    .join("");
  const other = warnings
    .filter((w) => w.code !== "FIELD_CRYPTO_KEY_LOST" && w.code !== "PACK_UNSIGNED")
    .map((w) => `<p class="indicator" data-seal-warning="${escapeHtml(w.code)}">${escapeHtml(t("comprobante.warningIndicator", { code: w.code }, lang))}</p>`)
    .join("");
  const by = input.statement.integrityRollup.byClass;
  const n = (k: IntegrityClass) => by?.[k] ?? 0;
  const chain = input.evidence.ledgerChainValid ? t("comprobante.chainOk", {}, lang) : t("comprobante.chainBroken", {}, lang);
  const integrity = `<p class="integrity-line">${escapeHtml(
    t(
      "comprobante.integrityLine",
      {
        valid: n("VALID"),
        manual: n("MANUAL"),
        auto: n("AUTO"),
        conflict: n("CONFLICT"),
        entries: input.evidence.ledgerEntryCount,
        chain,
      },
      lang,
    ),
  )}</p>`;
  const uncertified = input.manifest.certified ? "" : `<div class="uncertified">${escapeHtml(t("comprobante.uncertified", {}, lang))}</div>`;
  return `${uncertified}${signatureBox}${fingerprintLine}${indicator}${cryptoHtml}${other}${integrity}`;
}

function metricsBlock(input: ReportInput, lang: Language): string {
  const d = displayStatement(input.statement);
  const cells: { value: string; label: string; gross?: boolean }[] = [
    { value: d.regular, label: t("comprobante.metricRegular", {}, lang) },
    { value: d.overtime, label: t("comprobante.metricOvertime", {}, lang) },
    { value: d.transit, label: t("comprobante.metricTravel", {}, lang) },
    { value: String(input.statement.sessionIds.length), label: t("comprobante.metricSessions", {}, lang) },
    { value: d.gross, label: t("comprobante.metricGross", {}, lang), gross: true },
  ];
  const html = cells
    .map(
      (c) =>
        `<div class="metric${c.gross ? " gross" : ""}"><div class="num">${escapeHtml(c.value)}</div><div class="lbl">${escapeHtml(c.label)}</div></div>`,
    )
    .join("");
  return `<div class="metrics">${html}</div><p class="lunch-line">${escapeHtml(t("comprobante.lunchLine", { minutes: input.statement.lunchMinutes }, lang))}</p>`;
}

function sessionTable(input: ReportInput, role: PremiumRole, lang: Language): { html: string; omitted: number } {
  const fmt: FormatOptions = { lang };
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  const shown = displayStatement(input.statement);
  const bySession = new Map(shown.rows.map((r) => [r.sessionId, r]));
  const split = getPayrollPolicy(input.statement.policyId).segmentation === "WORKDAY";
  const history = companyCalendar(input.company);
  const omitZeroPay = role === "EMPLOYEE_RECEIPT";
  let omitted = 0;
  const body = input.statement.sessionIds
    .map((id) => {
      const s = byId.get(id);
      if (!s) return "";
      const row = bySession.get(id);
      const minutes = row?.workedMinutes ?? 0;
      const hours = formatHundredths(minutesToHundredths(minutes));
      const amountCents = row?.amountCents ?? 0;
      if (omitZeroPay && isZeroPayRow(minutes, amountCents)) {
        omitted += 1;
        return "";
      }
      const start = s.actualStartAtMs ?? s.declaredStartAtMs;
      const slice = split ? periodSliceOf(s, input.statement.periodStart, input.statement.periodEnd, history, input.statement.periodEnd) : null;
      const from = slice?.displayStartMs ?? start;
      const to = slice?.displayEndMs ?? s.endAtMs;
      const cont: string[] = [];
      if (slice?.continuesFromMs != null) cont.push(t("history.continuesFrom", { date: formatDate(slice.continuesFromMs, fmt) }, lang));
      if (slice?.continuesUntilMs != null) cont.push(t("history.continuesUntil", { date: formatDate(slice.continuesUntilMs, fmt) }, lang));
      const zero = slice?.zeroDuration ?? (s.endAtMs !== null && Math.round((s.endAtMs - start) / 60000) <= 0);
      const note = s.bookkeeping.manualNote ? noteToHtml(s.bookkeeping.manualNote, escapeHtml) : "";
      const lunchNote = lunchRangeNote(s, lang);
      const badge = sessionIntegrityLabel(s, lang);
      return `
        <tr>
          <td><strong>${escapeHtml(formatDate(from, fmt))}</strong></td>
          <td>${sessionSitesLabel(s, input.sites, lang)}${note ? `<span class="notes">"${note}"</span>` : ""}</td>
          <td>${escapeHtml(formatTime(from, fmt))} - ${to != null ? escapeHtml(formatTime(to, fmt)) : "—"}${cont.length ? `<span class="notes">(${escapeHtml(cont.join("; "))})</span>` : ""}${lunchNote}${zero ? `<span class="notes">${escapeHtml(t("comprobante.zeroDuration", {}, lang))}</span>` : ""}</td>
          <td class="fig"><strong>${escapeHtml(hours)}</strong><span class="notes">${minutes} min</span></td>
          <td class="fig">${escapeHtml(row?.amount ?? formatCurrency(0))}</td>
          <td><span class="badge b-${s.integrityClass}">${escapeHtml(badge)}</span></td>
        </tr>`;
    })
    .join("");
  const head = `<thead><tr><th>${escapeHtml(t("comprobante.colDate", {}, lang))}</th><th>${escapeHtml(t("comprobante.colSite", {}, lang))}</th><th>${escapeHtml(t("comprobante.colSchedule", {}, lang))}</th><th class="fig">${escapeHtml(t("comprobante.colHours", {}, lang))}</th><th class="fig">${escapeHtml(t("comprobante.colAmount", {}, lang))}</th><th>${escapeHtml(t("comprobante.colIntegrity", {}, lang))}</th></tr></thead>`;
  const omittedNote = omitZeroPay && omitted > 0 ? `<p class="notes">${escapeHtml(t("reports.zeroRowsOmitted", { count: omitted }, lang))}</p>` : "";
  return { html: `<table>${head}<tbody>${body}</tbody></table>${omittedNote}`, omitted };
}

function policyBlock(input: ReportInput, lang: Language): string {
  const id = input.statement.policyId;
  const labelKey = `settings.policies.${id}`;
  const label = t(labelKey, {}, lang);
  const policy = label === labelKey ? id : label;
  const applied = new Set(input.statement.appliedRules ?? []);
  const flags = input.company.payrollLegalFlags ?? {};
  const lines: string[] = [];
  if (applied.has("CA_DOUBLE_TIME_12H")) lines.push(t("comprobante.ruleDouble", {}, lang));
  else if (flags.caDoubleTime) lines.push(t("comprobante.flagDouble", {}, lang));
  if (applied.has("CA_SEVENTH_DAY")) lines.push(t("comprobante.ruleSeventh", {}, lang));
  else if (flags.caSeventhDay) lines.push(t("comprobante.flagSeventh", {}, lang));
  if (applied.has("CA_MEAL_PREMIUM")) lines.push(t("comprobante.ruleMeal", {}, lang));
  if (applied.has("CA_REST_PREMIUM")) lines.push(t("comprobante.ruleRest", {}, lang));
  for (const code of applied) {
    if (code !== "CA_DOUBLE_TIME_12H" && code !== "CA_SEVENTH_DAY" && code !== "CA_MEAL_PREMIUM" && code !== "CA_REST_PREMIUM") {
      lines.push(t("comprobante.ruleUnknown", { code }, lang));
    }
  }
  if (applied.size === 0 && !flags.caDoubleTime && !flags.caSeventhDay) lines.push(t("comprobante.rulesNone", {}, lang));
  if (input.company.transitPaid) lines.push(t("comprobante.flagTransit", { mult: input.company.transitRateMultiplier }, lang));
  if (input.company.transitCountsTowardOvertime) lines.push(t("comprobante.flagTransitOt", {}, lang));
  const rulesHtml = lines.map((line) => `<p class="rule">${escapeHtml(line)}</p>`).join("");
  return `
    <div class="section-title">${escapeHtml(t("comprobante.policyTitle", {}, lang))}</div>
    <p class="rule">${escapeHtml(policy)} <span class="muted">(${escapeHtml(id)})</span></p>
    <div class="section-title">${escapeHtml(t("comprobante.rulesTitle", {}, lang))}</div>
    ${rulesHtml}`;
}

function formatGap(ms: number, lang: Language): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 1) return t("comprobante.powerOffSeconds", { n: Math.max(1, Math.round(ms / 1000)) }, lang);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return t("comprobante.powerOffHours", { h, m }, lang);
  return t("comprobante.powerOffMinutes", { n: totalMin }, lang);
}

export function powerOffSentence(n: PowerOffNote, lang: Language): string {
  const fmt: FormatOptions = { lang };
  const from = formatDateTime(n.lastHeartbeatMs, fmt);
  const resume = formatDateTime(n.resumedAtMs, fmt);
  if (n.deviceOffMs !== null && n.bootAtMs !== null) {
    return t(
      "comprobante.powerOffDevice",
      { id: n.sessionId, from, resume, off: formatGap(n.deviceOffMs, lang), gap: formatGap(n.gapMs, lang) },
      lang,
    );
  }
  return t("comprobante.powerOffUnknown", { id: n.sessionId, from, resume, gap: formatGap(n.gapMs, lang) }, lang);
}

function powerOffBlock(input: ReportInput, lang: Language): string {
  const notes = input.powerOffs ?? [];
  if (!notes.length) return "";
  const body = notes.map((n) => `<p class="rule">${escapeHtml(powerOffSentence(n, lang))}</p>`).join("");
  return `
    <div class="section-title">${escapeHtml(t("comprobante.powerOffTitle", {}, lang))}</div>
    ${body}`;
}

function retentionBlock(input: ReportInput, lang: Language): string {
  return `
    <div class="section-title">${escapeHtml(t("comprobante.retentionTitle", {}, lang))}</div>
    <p class="muted">${escapeHtml(t("comprobante.retentionBody", { days: input.company.traceRetentionDays }, lang))}</p>
    <p class="muted">${escapeHtml(t("comprobante.exportBody", {}, lang))}</p>`;
}

function verifyBlock(input: ReportInput, lang: Language): string {
  const fmt: FormatOptions = { lang };
  const when = `${formatDate(input.manifest.sealedAtMs, fmt)} ${formatTime(input.manifest.sealedAtMs, fmt)}`;
  return `
    <div class="verify">
      <div class="verify-copy">
        <div class="section-title">${escapeHtml(t("comprobante.verifyTitle", {}, lang))}</div>
        <div class="hash">${escapeHtml(input.manifest.packHash)}</div>
        <p class="muted">${escapeHtml(t("comprobante.verifyHint", { packId: input.manifest.packId, when }, lang))}</p>
      </div>
      <div class="qr-pad">${verificationQrSvg(input.manifest.packHash)}</div>
    </div>`;
}

function versionsBlock(input: ReportInput, lang: Language): string {
  const doc = input.manifest.documentVersion ?? 1;
  const manifest = input.manifest.manifestVersion ?? 1;
  const lines = [t("comprobante.versions", { doc, manifest, packId: input.manifest.packId }, lang)];
  const version = input.manifest.appVersion?.trim() || APP_VERSION;
  const codeNum = input.manifest.versionCode;
  const code = codeNum != null && Number.isFinite(codeNum) ? String(codeNum) : readBuildLabel();
  const commitRaw = (input.manifest.gitCommit ?? readGitCommit() ?? "").trim();
  const commit = /^[0-9a-f]{7,40}$/i.test(commitRaw) ? commitRaw.slice(0, 7) : "";
  lines.push(
    commit
      ? t("comprobante.versionsBuild", { version, code, commit }, lang)
      : t("comprobante.versionsBuildNoCommit", { version, code }, lang),
  );
  const zones = input.manifest.sessionTimeZones;
  if (zones?.length) {
    const zone = [...new Set(zones.map((z) => z.timeZone))].join(", ");
    lines.push(t("comprobante.versionsZone", { zone }, lang));
  }
  return `<p class="versions">${lines.map((line) => escapeHtml(line)).join(" · ")}</p>`;
}

function linesTable(input: ReportInput, lang: Language): string {
  const rows = input.statement.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.dateString)}</td><td class="fig">#${l.sessionId}</td><td>${escapeHtml(lineLabel(l, lang))}</td><td class="fig">${l.minutes}</td><td class="fig">${formatCurrency(l.rate)}</td><td class="fig">${formatCurrency(l.amount)}</td></tr>`,
    )
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.linesTitle", {}, lang))}</div><table><thead><tr><th>${escapeHtml(t("comprobante.colDate", {}, lang))}</th><th class="fig">${escapeHtml(t("comprobante.colSession", {}, lang))}</th><th>${escapeHtml(t("comprobante.colConcept", {}, lang))}</th><th class="fig">${escapeHtml(t("comprobante.colMinutes", {}, lang))}</th><th class="fig">${escapeHtml(t("comprobante.colRate", {}, lang))}</th><th class="fig">${escapeHtml(t("comprobante.colAmount", {}, lang))}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function warningsBlock(input: ReportInput, lang: Language): string {
  const warnings = input.statement.warnings;
  if (!warnings.length && !input.evidence.conflicts.length && input.manifest.certified) return "";
  const lines = warnings.map((w) => `<p class="rule">${escapeHtml(tWarning(w, lang))}</p>`).join("");
  const conflicts = input.evidence.conflicts
    .map((c) => `<p class="rule">${escapeHtml(t("comprobante.conflictLine", { id: c.sessionId, reason: c.reason }, lang))}</p>`)
    .join("");
  return `
    ${warnings.length ? `<div class="section-title">${escapeHtml(t("comprobante.warningsTitle", {}, lang))}</div>${lines}` : ""}
    <div class="section-title">${escapeHtml(t("comprobante.conflictTitle", {}, lang))}</div>
    ${conflicts || `<p class="rule">${escapeHtml(t("comprobante.noConflicts", {}, lang))}</p>`}
    <p class="muted">${escapeHtml(t("comprobante.ledgerHead", {}, lang))} <span class="hash">${escapeHtml(input.evidence.ledgerHeadHash)}</span></p>`;
}

function ledgerAnnex(rows: ForensicLedgerRow[] | undefined, lang: Language): string {
  const fmt: FormatOptions = { lang };
  const body = (rows ?? [])
    .map((row) => {
      const state = [row.fromState, row.toState].filter(Boolean).join(" → ");
      const integrity = row.integrityClass && integrityKey(row.integrityClass) ? t(integrityKey(row.integrityClass), {}, lang) : (row.integrityClass ?? "—");
      return `<tr>
        <td class="fig">${row.id}</td>
        <td>${escapeHtml(formatDateTime(row.timestampMs, fmt))}</td>
        <td>${escapeHtml(row.actor)}</td>
        <td>${escapeHtml(row.intent)}${row.reason ? `<span class="notes">${escapeHtml(row.reason)}</span>` : ""}${row.detail ? `<span class="notes">${escapeHtml(row.detail)}</span>` : ""}${row.sessionId != null ? `<span class="notes">#${row.sessionId}</span>` : ""}</td>
        <td>${escapeHtml(state || "—")}</td>
        <td>${escapeHtml(integrity)}</td>
        <td class="mono">${escapeHtml(row.prevHash)} → ${escapeHtml(row.hash)}</td>
      </tr>`;
    })
    .join("");
  const empty = body ? "" : `<p class="muted">${escapeHtml(t("comprobante.annexLedgerEmpty", {}, lang))}</p>`;
  return `
    <section class="annex" data-annex="ledger">
      <div class="section-title">${escapeHtml(t("comprobante.annexLedgerTitle", {}, lang))}</div>
      ${empty}
      <table><thead><tr>
        <th class="fig">${escapeHtml(t("comprobante.annexColId", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColWhen", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColActor", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColIntent", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColState", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColIntegrity", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColHash", {}, lang))}</th>
      </tr></thead><tbody>${body}</tbody></table>
    </section>`;
}

function transitAnnex(input: ReportInput, lang: Language): string {
  const rows = input.evidence.transitSegments ?? [];
  if (!rows.length) return "";
  const fmt: FormatOptions = { lang };
  const yes = t("comprobante.reliableYes", {}, lang);
  const no = t("comprobante.reliableNo", {}, lang);
  const body = rows
    .map((row) => {
      const clip = row.clip
        ? `${formatTime(row.clip.beforeStartAtMs, fmt)}–${row.clip.beforeEndAtMs != null ? formatTime(row.clip.beforeEndAtMs, fmt) : "—"} → ${row.clip.afterStartAtMs != null ? formatTime(row.clip.afterStartAtMs, fmt) : "—"}–${row.clip.afterEndAtMs != null ? formatTime(row.clip.afterEndAtMs, fmt) : "—"}`
        : "—";
      return `<tr>
        <td>${siteAliasHtml(input.sites, row.fromSiteId, lang)}</td>
        <td>${siteAliasHtml(input.sites, row.toSiteId, lang)}</td>
        <td>${escapeHtml(formatTime(row.startAtMs, fmt))}</td>
        <td>${row.endAtMs != null ? escapeHtml(formatTime(row.endAtMs, fmt)) : "—"}</td>
        <td>${escapeHtml(row.cancelled ? yes : no)}</td>
        <td>${escapeHtml(row.paid ? yes : no)}</td>
        <td class="fig">${row.minutes}</td>
        <td>${escapeHtml(clip)}</td>
      </tr>`;
    })
    .join("");
  return `
    <section class="annex" data-annex="transit">
      <div class="section-title">${escapeHtml(t("comprobante.annexTransitTitle", {}, lang))}</div>
      <table><thead><tr>
        <th>${escapeHtml(t("comprobante.annexColOrigin", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColDestination", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColStart", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColEnd", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColCancelled", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColPaid", {}, lang))}</th>
        <th class="fig">${escapeHtml(t("comprobante.annexColMinutes", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColClip", {}, lang))}</th>
      </tr></thead><tbody>${body}</tbody></table>
    </section>`;
}

function minutes1(ms: number): string {
  return String(Math.round((ms / 60_000) * 10) / 10);
}

function coverageBlock(input: ReportInput, lang: Language): string {
  const rows = input.evidence.monitoringCoverage ?? [];
  if (!rows.length) return "";
  const body = rows
    .map((row) => {
      const text =
        row.coveragePercent === null
          ? t("comprobante.coverageUnknown", { id: row.sessionId }, lang)
          : t("comprobante.coverageLine", { id: row.sessionId, percent: row.coveragePercent, minutes: minutes1(row.unmonitoredMs) }, lang);
      return `<tr data-coverage-session="${row.sessionId}"><td>${escapeHtml(text)}</td></tr>`;
    })
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.coverageTitle", {}, lang))}</div><p class="muted">${escapeHtml(t("comprobante.coverageHint", {}, lang))}</p><table data-monitoring-coverage="1"><tbody>${body}</tbody></table>`;
}

function replayBlock(input: ReportInput, lang: Language): string {
  const rows = input.evidence.sessionReplay ?? [];
  if (!rows.length) return "";
  const body = rows
    .map((row) => {
      const text =
        row.status === "MISMATCH"
          ? t(
              "comprobante.replayMismatch",
              {
                id: row.sessionId,
                storedWork: row.stored?.workedMinutes ?? t("comprobante.replayMissing", {}, lang),
                storedTransit: row.stored?.transitMinutes ?? t("comprobante.replayMissing", {}, lang),
                storedBreak: row.stored?.breakMinutes ?? t("comprobante.replayMissing", {}, lang),
                ledgerWork: row.ledger?.workedMinutes ?? t("comprobante.replayMissing", {}, lang),
                ledgerTransit: row.ledger?.transitMinutes ?? t("comprobante.replayMissing", {}, lang),
                ledgerBreak: row.ledger?.breakMinutes ?? t("comprobante.replayMissing", {}, lang),
              },
              lang,
            )
          : t(
              row.status === "MATCH"
                ? "comprobante.replayMatch"
                : row.status === "INCOMPLETE"
                  ? "comprobante.replayIncomplete"
                  : "comprobante.replaySkipped",
              { id: row.sessionId },
              lang,
            );
      return `<tr data-session-replay="${row.sessionId}" data-replay-status="${row.status}"><td>${escapeHtml(text)}</td></tr>`;
    })
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.replayTitle", {}, lang))}</div><p class="muted">${escapeHtml(t("comprobante.replayHint", {}, lang))}</p><table data-session-replay="1"><tbody>${body}</tbody></table>`;
}

function trustBlock(input: ReportInput, lang: Language): string {
  const rows = input.evidence.locationTrust ?? [];
  if (!rows.length) return "";
  const body = rows
    .map(
      (row) =>
        `<tr data-location-trust="${row.sessionId}"><td class="fig">#${row.sessionId}</td><td class="fig">${row.score}</td><td>${escapeHtml(t(`health.trust.labels.${row.label}`, {}, lang))}</td></tr>`,
    )
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.trustTitle", {}, lang))}</div><p class="muted">${escapeHtml(t("comprobante.trustHint", {}, lang))}</p><table data-location-trust="1"><tbody>${body}</tbody></table>`;
}

function deviceBlock(input: ReportInput, lang: Language): string {
  const device = input.evidence.deviceIntegrity;
  if (!device) return "";
  const bits: string[] = [];
  if (device.rooted) bits.push(t("comprobante.deviceRoot", { hits: device.rootHits.join(", ") || "—" }, lang));
  if (device.emulator) bits.push(t("comprobante.deviceEmulator", { hits: device.emulatorHits.join(", ") || "—" }, lang));
  if (device.developerOptionsEnabled) bits.push(t("comprobante.deviceDeveloper", {}, lang));
  const text = bits.length ? bits.join(" · ") : t("comprobante.deviceClear", {}, lang);
  return `<div class="seal-warning" data-device-integrity="1">${escapeHtml(t("comprobante.deviceTitle", {}, lang))}: ${escapeHtml(text)}</div>`;
}

function forensicBlock(input: ReportInput, lang: Language): string {
  const seals = input.evidence.sessionSeals ?? [];
  if (!seals.length) return "";
  const rows = seals
    .map(
      (seal) =>
        `<tr data-session-forensic="${seal.sessionId}"><td class="fig">#${seal.sessionId}</td><td class="hash">${escapeHtml(seal.sessionHash)}</td></tr>`,
    )
    .join("");
  return `<div class="section-title">${escapeHtml(t("comprobante.forensicTitle", {}, lang))}</div><p class="muted">${escapeHtml(t("comprobante.forensicHint", {}, lang))}</p><table data-session-seals="1"><tbody>${rows}</tbody></table>`;
}

function mockLocationBlock(traces: { mockedFacts?: number }[], lang: Language): string {
  const n = traces.reduce((sum, tr) => sum + (tr.mockedFacts && tr.mockedFacts > 0 ? tr.mockedFacts : 0), 0);
  if (n <= 0) return "";
  return `<div class="seal-warning" data-mock-location="1">${escapeHtml(t("comprobante.mockLocation", { n }, lang))}</div>`;
}

function isManualExitLedger(row: ForensicLedgerRow): boolean {
  if (row.intent !== "CLOSE_DAY" || row.sessionId == null) return false;
  if (MANUAL_EXIT_REASONS.has(row.reason)) return true;
  return row.integrityClass === "MANUAL" && row.reason !== "RECOVERED_CLOSED";
}

function enterExitAnnex(input: ReportInput, lang: Language): string {
  const fmt: FormatOptions = { lang };
  const events = input.evidence.traces.flatMap((tr) => tr.enterExit.map((e) => ({ sessionId: tr.sessionId, type: e.type, timestampMs: e.timestampMs, reliable: e.reliable })));
  const exitSessions = new Set(events.filter((e) => e.type === "EXIT").map((e) => e.sessionId));
  const manualFromLedger = (input.ledger ?? []).filter(isManualExitLedger);
  const listed = new Set(manualFromLedger.map((row) => row.sessionId));
  const manualFromSessions = input.sessions.filter((session) => {
    if (session.endAtMs == null || exitSessions.has(session.id) || listed.has(session.id)) return false;
    const reason = session.bookkeeping.integrityReason;
    if (reason === "RECOVERED_CLOSED" || reason === "ORPHAN_END_CONFIRMED" || reason === "AUTO_CLOSE_12H" || reason === "AUTO_CLOSE_ABANDONMENT" || reason === "EXIT_DECISION_EXPIRED") {
      return false;
    }
    return session.integrityClass === "MANUAL" || MANUAL_EXIT_REASONS.has(reason);
  });
  const gpsRows = events
    .map(
      (e) => `<tr>
        <td class="fig">#${e.sessionId}</td>
        <td>${escapeHtml(t(e.type === "ENTER" ? "comprobante.enter" : "comprobante.exit", {}, lang))}</td>
        <td>${escapeHtml(formatDateTime(e.timestampMs, fmt))}</td>
        <td>${escapeHtml(t(e.reliable ? "comprobante.reliableYes" : "comprobante.reliableNo", {}, lang))}</td>
      </tr>`,
    )
    .join("");
  const manualRows = [
    ...manualFromLedger.map(
      (row) => `<tr data-manual-exit="${row.sessionId}">
        <td class="fig">#${row.sessionId}</td>
        <td>${escapeHtml(t("comprobante.manualExit", {}, lang))}</td>
        <td>${escapeHtml(formatDateTime(row.timestampMs, fmt))}</td>
        <td>—</td>
      </tr>`,
    ),
    ...manualFromSessions.map(
      (session) => `<tr data-manual-exit="${session.id}">
        <td class="fig">#${session.id}</td>
        <td>${escapeHtml(t("comprobante.manualExit", {}, lang))}</td>
        <td>${escapeHtml(formatDateTime(session.endAtMs ?? 0, fmt))}</td>
        <td>—</td>
      </tr>`,
    ),
  ].join("");
  const body = `${gpsRows}${manualRows}`;
  return `
    <section class="annex" data-annex="enter-exit">
      <div class="section-title">${escapeHtml(t("comprobante.annexEnterTitle", {}, lang))}</div>
      <p class="muted">${escapeHtml(t("comprobante.annexNoCoordinates", {}, lang))}</p>
      ${body ? "" : `<p class="muted">${escapeHtml(t("comprobante.annexEnterEmpty", {}, lang))}</p>`}
      <table><thead><tr>
        <th class="fig">${escapeHtml(t("comprobante.colSession", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColEvent", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColWhen", {}, lang))}</th>
        <th>${escapeHtml(t("comprobante.annexColReliable", {}, lang))}</th>
      </tr></thead><tbody>${body}</tbody></table>
    </section>`;
}

export function renderPremiumDocument(input: ReportInput, role: PremiumRole): string {
  const lang = localeOf(input);
  const theme = themeOf(input);
  const rows = sessionTable(input, role, lang);
  const watermark = input.practice
    ? `<div class="watermark" data-practice="1"><span>${escapeHtml(t("support.practice.watermark", {}, lang))}</span></div>`
    : "";
  const employer = role === "EMPLOYER_DOSSIER" ? `${siteMoveBlock(input.siteMoves, input.sites, lang)}${linesTable(input, lang)}${warningsBlock(input, lang)}` : "";
  const annexes = `${transitAnnex(input, lang)}${input.annex?.ledger ? ledgerAnnex(input.ledger, lang) : ""}${input.annex?.enterExit ? enterExitAnnex(input, lang) : ""}`;
  return `<html data-document-version="${input.manifest.documentVersion ?? 2}" data-theme="${theme}" data-locale="${lang}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${css(theme)}</style></head><body class="theme-${theme}">
    ${watermark}
    <div class="sheet">
      ${headerBlock(input, role, lang)}
      ${mockLocationBlock(input.evidence.traces, lang)}
      ${signatureBlock(input, lang)}
      ${metricsBlock(input, lang)}
      ${rows.html}
      ${forensicBlock(input, lang)}
      ${trustBlock(input, lang)}
      ${coverageBlock(input, lang)}
      ${replayBlock(input, lang)}
      ${deviceBlock(input, lang)}
      ${powerOffBlock(input, lang)}
      ${premiumLinesBlock(input, lang)}
      ${employer}
      ${policyBlock(input, lang)}
      ${retentionBlock(input, lang)}
      <div class="sheet-tail">
        ${verifyBlock(input, lang)}
        ${versionsBlock(input, lang)}
        <div class="footer">${escapeHtml(t("comprobante.legalFooter", {}, lang))}</div>
      </div>
      ${annexes}
    </div>
  </body></html>`;
}
