/** Componentes — SessionTimeline renderiza asientos del ledger en orden. */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SessionTimeline, ledgerToTimeline } from "../SessionTimeline";
import { makeLedgerChain } from "../../../../test/fixtures/ledger.fixture";

describe("SessionTimeline", () => {
  test("renderiza los asientos del ledger en el orden de la cadena", async () => {
    const entries = await makeLedgerChain();
    const events = ledgerToTimeline(entries, (e) => `T:${e.intent}`);
    expect(events.map((e) => e.type)).toEqual(["start", "arrival", "close"]);
    expect(events[1].subtitle).toBe("ESPERANDO → ACTIVA");
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
    expect(ev.subtitle).toBe(e.reason);
  });
});
