/**
 * EditSessionModal — una sesión del mismo minuto no se convierte en 24 h
 * al abrir «Editar sesión», y Guardar no se habilita si los HH:mm no cambian.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { setLanguage, t } from "../../../i18n";
import { TimeAuthorityService } from "../../../services/evidence/TimeAuthorityService";
import { atTimeOfDayAfter } from "../../../utils/dateUtils";
import { COMPANY, HOUR, makeClosedSession, MONDAY_8AM, RATES } from "../../../../test/fixtures/session.fixture";
import { EditSessionModal } from "../EditSessionModal";

// lun 21 sep 2026 01:56:10 PDT → 01:56:40 (se ve 01:56 – 01:56).
const SAME_MIN_START = Date.UTC(2026, 8, 21, 8, 56, 10);
const SAME_MIN_END = SAME_MIN_START + 30_000;

function renderEdit(session: ReturnType<typeof makeClosedSession>, onSave = jest.fn()) {
  const checkOverlap = jest.fn().mockResolvedValue(false);
  render(
    <EditSessionModal visible session={session} onCancel={jest.fn()} onSave={onSave} checkOverlap={checkOverlap} />,
  );
  return { onSave, checkOverlap };
}

function saveButton() {
  return screen.getByRole("button", { name: t("common.save") });
}

describe("EditSessionModal", () => {
  test("no deja guardar un fin que deja el almuerzo fijo fuera de la jornada", () => {
    const start = Date.UTC(2026, 8, 21, 8, 25, 0);
    const session = makeClosedSession(start, 0, {
      endAtMs: start + 36 * 60_000,
      lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 60 },
    });
    const { onSave } = renderEdit(session);
    expect(screen.getByText(t("modals.lunchMustFit"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("edit-note"), "la acorté");
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  test("sesión del mismo minuto: la nota no anuncia el día siguiente ni habilita Guardar", () => {
    const session = makeClosedSession(SAME_MIN_START, 0, { endAtMs: SAME_MIN_END });
    const { onSave } = renderEdit(session);
    expect(screen.getByTestId("edit-start").props.value).toBe("01:56");
    expect(screen.getByTestId("edit-end").props.value).toBe("01:56");
    expect(screen.queryByText(t("modals.endsNextDay"))).toBeNull();
    fireEvent.changeText(screen.getByTestId("edit-note"), "cerré en el mismo minuto");
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  test("jornada con segundos, sin tocar las horas: Guardar sigue deshabilitado", () => {
    const start = Date.UTC(2026, 8, 21, 15, 0, 30);
    const end = Date.UTC(2026, 8, 22, 0, 0, 45);
    const { onSave } = renderEdit(makeClosedSession(start, 0, { endAtMs: end }));
    expect(screen.queryByText(t("modals.endsNextDay"))).toBeNull();
    fireEvent.changeText(screen.getByTestId("edit-note"), "solo una nota");
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  test("cambiar la salida conserva los segundos de la entrada y no alarga a 24 h", () => {
    const { onSave } = renderEdit(makeClosedSession(SAME_MIN_START, 0, { endAtMs: SAME_MIN_END }));
    fireEvent.changeText(screen.getByTestId("edit-end"), "0157");
    fireEvent.changeText(screen.getByTestId("edit-note"), "un minuto más");
    expect(screen.queryByText(t("modals.endsNextDay"))).toBeNull();
    expect(saveButton().props.accessibilityState.disabled).toBe(false);
    fireEvent.press(saveButton());
    expect(onSave).toHaveBeenCalledWith({
      declaredStartAtMs: SAME_MIN_START,
      endAtMs: atTimeOfDayAfter(SAME_MIN_START, "01:57"),
      note: "un minuto más",
    });
  });

  test("igualar los relojes a propósito anuncia el día siguiente y guarda ese fin", () => {
    const start = Date.UTC(2026, 8, 21, 15, 15, 30);
    const end = Date.UTC(2026, 8, 22, 0, 0, 45);
    const { onSave } = renderEdit(makeClosedSession(start, 0, { endAtMs: end }));
    fireEvent.changeText(screen.getByTestId("edit-start"), "0900");
    fireEvent.changeText(screen.getByTestId("edit-end"), "0900");
    fireEvent.changeText(screen.getByTestId("edit-note"), "turno de noche");
    expect(screen.getByText(t("modals.endsNextDay"))).toBeTruthy();
    fireEvent.press(saveButton());
    expect(onSave).toHaveBeenCalledWith({
      declaredStartAtMs: Date.UTC(2026, 8, 21, 16, 0, 0),
      endAtMs: Date.UTC(2026, 8, 22, 16, 0, 0),
      note: "turno de noche",
    });
  });

  test("un turno de 24 h ya guardado sigue anunciando el día siguiente, pero la nota no guarda", () => {
    const start = Date.UTC(2026, 8, 21, 8, 56, 0);
    const end = start + 24 * 60 * 60 * 1000;
    const { onSave } = renderEdit(makeClosedSession(start, 0, { endAtMs: end }));
    expect(screen.getByText(t("modals.endsNextDay"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("edit-note"), "ya cruzaba la medianoche");
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  test("un fin posterior a ahora se explica en es y en en, y Guardar queda deshabilitado", () => {
    const start = Date.UTC(2026, 8, 26, 14, 0, 0);
    const end = Date.UTC(2026, 8, 26, 14, 30, 0);
    const { onSave } = renderEdit(makeClosedSession(start, 0, { endAtMs: end }));
    fireEvent.changeText(screen.getByTestId("edit-end"), "0900");
    fireEvent.changeText(screen.getByTestId("edit-note"), "todavía no");
    expect(screen.getByText(t("modals.futureTime"))).toBeTruthy();
    expect(screen.getByTestId("edit-end").props.accessibilityValue.max).toBe(TimeAuthorityService.futureCeiling());
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  test("el aviso de hora futura también está en inglés", () => {
    setLanguage("en");
    const start = Date.UTC(2026, 8, 26, 14, 0, 0);
    const end = Date.UTC(2026, 8, 26, 14, 30, 0);
    renderEdit(makeClosedSession(start, 0, { endAtMs: end }));
    fireEvent.changeText(screen.getByTestId("edit-end"), "0900");
    expect(screen.getByText(t("modals.futureTime"))).toBeTruthy();
    expect(screen.getByText("That time is later than now. Time that has not happened yet cannot be recorded.")).toBeTruthy();
  });

  test("la vista previa del total es de solo lectura y no guarda", () => {
    const session = makeClosedSession(MONDAY_8AM, 8);
    const onSave = jest.fn();
    render(
      <EditSessionModal
        visible
        session={session}
        rates={RATES}
        company={COMPANY}
        nowMs={MONDAY_8AM + 9 * HOUR}
        onCancel={jest.fn()}
        onSave={onSave}
        checkOverlap={jest.fn().mockResolvedValue(false)}
      />,
    );
    const preview = screen.getByTestId("edit-preview");
    expect(String(preview.props.children)).toContain("$");
    expect(String(preview.props.children)).not.toContain("NaN");
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  test("fin ≤ inicio, sin la regla de medianoche, se explica y no se guarda", () => {
    const start = Date.UTC(2026, 8, 21, 15, 0, 0);
    const { onSave } = renderEdit(makeClosedSession(start, 0, { endAtMs: start }));
    expect(screen.getByText(t("modals.endNotAfterStart"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("edit-note"), "mismo instante");
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });
});
