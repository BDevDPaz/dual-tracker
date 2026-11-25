/** SessionAuditView / PeriodAuditSection: lo que no se registra se rotula, en ES y EN, sin inventar. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { LedgerEntry, LedgerIntent } from "../../../core/contracts";
import { selectPeriodAuditRows, selectSessionAudit } from "../../../core/selectors";
import { setLanguage, t } from "../../../i18n";
import { PeriodAuditSection } from "../PeriodAuditSection";
import { SessionAuditView } from "../SessionAuditView";
import { HOUR, MIN, MONDAY_8AM, makeClosedSession } from "../../../../test/fixtures/session.fixture";

let id = 1;
function entry(intent: LedgerIntent, actor: LedgerEntry["actor"], data: Record<string, unknown> = {}, cls: LedgerEntry["integrityClass"] = null, at = MONDAY_8AM): LedgerEntry {
  const draft = { sessionId: 1, actor, intent, fromState: null, toState: null, reason: intent, timestampMs: at, integrityClass: cls };
  const n = id++;
  return { ...draft, id: n, prevHash: `p${n}`, hash: `h${n}`, payloadJson: JSON.stringify({ ...draft, data }) };
}

function audit() {
  id = 1;
  const session = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT", bookkeeping: { integrityReason: "AUTO_CLOSE_12H", manualNote: "Última" } });
  const ledger = [
    entry("START_DAY", "USER", {}, "VALID"),
    entry("MANUAL_PATCH", "USER", { noteDigest: "vieja", before: { declaredStartAtMs: MONDAY_8AM }, after: { declaredStartAtMs: MONDAY_8AM + MIN } }, "MANUAL", MONDAY_8AM + HOUR),
    entry("GPS_LOST", "SYSTEM", {}, null, MONDAY_8AM + 2 * HOUR),
    entry("AUTO_CLOSE", "WATCHDOG", { cause: "MAX_OPEN_12H", confirmedOutside: false }, "CONFLICT", MONDAY_8AM + 12 * HOUR),
  ];
  return selectSessionAudit(session, { ledger, trailGaps: [{ kind: "recording", fromMs: MONDAY_8AM + 3 * HOUR, toMs: MONDAY_8AM + 4 * HOUR }], recomputedSealHash: null, latestNoteDigest: "nueva", restores: [] });
}

afterEach(() => setLanguage("es"));

describe("SessionAuditView", () => {
  test.each(["es", "en"] as const)("rotula «no registrado» y no inventa (%s)", (lang) => {
    setLanguage(lang);
    render(<SessionAuditView audit={audit()} />);
    expect(screen.getByText(t("audit.reasonNotRecorded"))).toBeTruthy();
    // El autor se rotula en cada edición; el resto de acciones de usuario lo resume «Lo que no se registra».
    expect(screen.getAllByText(t("audit.author")).length).toBe(1);
    expect(screen.getByTestId("audit-missing-PRIOR_REASONS").props.children).toBe(`${t("audit.notRecorded")}: ${t("audit.missing.PRIOR_REASONS")}`);
    expect(screen.getByTestId("audit-missing-GPS_LOSS_DURATION")).toBeTruthy();
    expect(screen.getByTestId("audit-monitoring-3").props.children).toContain(t("audit.gpsLost"));
    expect(screen.getByTestId("audit-gap-0").props.children).toContain(t("audit.gapRecording", { range: "" }).split(" ")[0]);
    expect(screen.getByTestId("audit-seal").props.children).toBe(t("audit.seal.MISSING"));
    expect(screen.getByTestId("audit-auto-4")).toBeTruthy();
    expect(screen.getByText(t("audit.conflictPending"))).toBeTruthy();
    expect(screen.getByText(t("audit.notConfirmedOutside"))).toBeTruthy();
  });
});

describe("PeriodAuditSection", () => {
  test("resume cada jornada y abre su auditoría", () => {
    const onOpen = jest.fn();
    render(<PeriodAuditSection rows={selectPeriodAuditRows([audit()])} onOpen={onOpen} />);
    expect(screen.getByText(`${t("audit.period.edits", { n: 1 })} · ${t("audit.period.conflictsOpen", { n: 1 })} · ${t("audit.period.autoClosed")} · ${t("audit.period.gaps", { n: 1 })}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId("period-audit-1"));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  test("vacío y error son estados distintos", () => {
    const { rerender } = render(<PeriodAuditSection rows={[]} onOpen={jest.fn()} />);
    expect(screen.getByText(t("audit.period.empty"))).toBeTruthy();
    rerender(<PeriodAuditSection rows={[]} error onOpen={jest.fn()} />);
    expect(screen.getByText(t("common.loadError"))).toBeTruthy();
  });
});
