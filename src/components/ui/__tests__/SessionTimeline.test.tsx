/** Componentes — SessionTimeline renderiza asientos del ledger en orden. */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SessionTimeline, ledgerToTimeline, ledgerSubtitle, timelineEntering, TIMELINE_STAGGER_MAX } from "../SessionTimeline";
import { makeLedgerChain } from "../../../../test/fixtures/ledger.fixture";

describe("SessionTimeline", () => {
  test("renderiza los asientos del ledger en el orden de la cadena", async () => {
    const entries = await makeLedgerChain();
    const events = ledgerToTimeline(entries, (e) => `T:${e.intent}`);
    expect(events.map((e) => e.type)).toEqual(["start", "arrival", "close"]);
    // Estados traducidos con t("states.*.label"), nunca el enum crudo.
    expect(events[1].subtitle).toBe("Esperando llegada → En sitio");
    expect(events.map((e) => e.subtitle ?? "").join(" ")).not.toMatch(/ESPERANDO|ACTIVA|CERRADA/);
    render(<SessionTimeline events={events} />);
    const titles = screen.getAllByText(/^T:/).map((n) => n.props.children);
    expect(titles).toEqual(["T:START_DAY", "T:ARRIVAL_CONFIRMED", "T:CLOSE_DAY"]);
  });

  test("sin asientos muestra el estado vacío", () => {
    render(<SessionTimeline events={[]} emptyText="vacío" />);
    expect(screen.getByText("vacío")).toBeTruthy();
  });

  test("asiento desconocido con CONFLICT se marca como warning", async () => {
    const [e] = await makeLedgerChain();
    const [ev] = ledgerToTimeline([{ ...e, intent: "PAYROLL_SEALED", integrityClass: "CONFLICT", fromState: null, toState: null }], () => "x");
    expect(ev.type).toBe("warning");
    // El reason es un código interno sin traducción: no se muestra.
    expect(ev.subtitle).toBeUndefined();
  });

  test("ledgerSubtitle: sin transición y con reason crudo no muestra códigos", () => {
    expect(ledgerSubtitle({ fromState: "CERRADA", toState: "CERRADA", reason: "NOTE" })).toBeUndefined();
    expect(ledgerSubtitle({ fromState: "ACTIVA", toState: "PAUSADA", reason: "X" })).toBe("En sitio → En almuerzo");
    expect(ledgerSubtitle({ fromState: "BOGUS" as never, toState: "ACTIVA", reason: "ACCURACY_GT_RADIUS" })).toBeUndefined();
  });

  test("solo los primeros 6 nodos se escalonan", () => {
    expect(TIMELINE_STAGGER_MAX).toBe(6);
    for (let i = 0; i < 6; i++) expect(timelineEntering(i, false)).toBeDefined();
    expect(timelineEntering(6, false)).toBeUndefined();
    expect(timelineEntering(20, true)).toBeUndefined();
    expect(timelineEntering(0, true)).toBeDefined();
  });
});
