/** LunchModal — rejilla 2×2, hora de inicio con máscara y error explicado. */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { setLanguage, t } from "../../../i18n";
import { TimeAuthorityService } from "../../../services/evidence/TimeAuthorityService";
import { LunchModal } from "../LunchModal";

describe("LunchModal", () => {
  test("la opción 0 se lee como sin almuerzo, no como 0 minutos", () => {
    const view = render(<LunchModal visible mode="close" onCancel={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.getByLabelText(t("modals.lunchNo"))).toBeTruthy();
    expect(screen.queryByLabelText(`0 ${t("common.minutes")}`)).toBeNull();
    view.unmount();
    setLanguage("en");
    render(<LunchModal visible mode="close" onCancel={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.getByLabelText(t("modals.lunchNo"))).toBeTruthy();
    setLanguage("es");
  });

  test("las cuatro opciones van en rejilla 2×2 (wrap)", () => {
    render(<LunchModal visible mode="close" onCancel={jest.fn()} onConfirm={jest.fn()} />);
    const grid = StyleSheet.flatten(screen.getByTestId("lunch-options").props.style) as { flexWrap: string };
    expect(grid.flexWrap).toBe("wrap");
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  test("con askStartTime: 1230 → 12:30 y confirma; hora imposible se explica", () => {
    const onConfirm = jest.fn();
    render(<LunchModal visible mode="close" askStartTime onCancel={jest.fn()} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByLabelText(`30 ${t("common.minutes")}`));
    fireEvent.changeText(screen.getByTestId("lunch-start"), "2599");
    expect(screen.getByText(t("common.invalidTime"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("lunch-start"), "1230");
    expect(screen.queryByText(t("common.invalidTime"))).toBeNull();
    fireEvent.press(screen.getByText(t("cta.finishDay")));
    expect(onConfirm).toHaveBeenCalledWith(30, "12:30");
  });

  test("un almuerzo posterior a ahora o fuera de la jornada no se confirma", () => {
    const sessionStartMs = Date.UTC(2026, 8, 26, 13, 0, 0);
    const sessionEndMs = Date.UTC(2026, 8, 26, 14, 0, 0);
    const onConfirm = jest.fn();
    const { rerender } = render(
      <LunchModal visible mode="close" askStartTime sessionStartMs={sessionStartMs} sessionEndMs={Date.UTC(2026, 8, 26, 15, 0, 0)} onCancel={jest.fn()} onConfirm={onConfirm} />,
    );
    fireEvent.press(screen.getByLabelText(`60 ${t("common.minutes")}`));
    fireEvent.changeText(screen.getByTestId("lunch-start"), "0730");
    expect(screen.getByText(t("modals.futureTime"))).toBeTruthy();
    expect(screen.getByTestId("lunch-start").props.accessibilityValue.max).toBe(TimeAuthorityService.futureCeiling());
    expect(screen.getByRole("button", { name: t("cta.finishDay") }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByText(t("cta.finishDay")));
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(<LunchModal visible mode="close" askStartTime sessionStartMs={sessionStartMs} sessionEndMs={sessionEndMs} onCancel={jest.fn()} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByLabelText(`30 ${t("common.minutes")}`));
    fireEvent.changeText(screen.getByTestId("lunch-start"), "0640");
    expect(screen.getByText(t("modals.lunchOutside"))).toBeTruthy();
    expect(screen.getByRole("button", { name: t("cta.finishDay") }).props.accessibilityState.disabled).toBe(true);
  });

  test("un almuerzo fijo de 60 min no cabe en una jornada de 36", () => {
    const sessionStartMs = Date.UTC(2026, 8, 21, 8, 25, 0);
    const sessionEndMs = sessionStartMs + 36 * 60_000;
    const onConfirm = jest.fn();
    const props = { visible: true as const, mode: "close" as const, sessionStartMs, sessionEndMs, onCancel: jest.fn(), onConfirm };
    const { rerender } = render(<LunchModal {...props} />);
    fireEvent.press(screen.getByLabelText(`60 ${t("common.minutes")}`));
    expect(screen.getByText(t("modals.lunchMustFit"))).toBeTruthy();
    expect(screen.getByRole("button", { name: t("cta.finishDay") }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByText(t("cta.finishDay")));
    expect(onConfirm).not.toHaveBeenCalled();
    setLanguage("en");
    rerender(<LunchModal {...props} />);
    fireEvent.press(screen.getByLabelText(`60 ${t("common.minutes")}`));
    expect(screen.getByText("Lunch must fit within the shift.")).toBeTruthy();
    setLanguage("es");
  });

  test("en supervisor, busy deshabilita reanudar y finalizar", () => {
    const onResume = jest.fn();
    const onFinish = jest.fn();
    render(<LunchModal visible mode="supervisor" busy elapsed="00:12" onCancel={jest.fn()} onResume={onResume} onFinish={onFinish} />);
    const resume = screen.getByRole("button", { name: t("cta.resume") });
    const finish = screen.getByRole("button", { name: t("cta.finishDay") });
    expect(resume.props.accessibilityState.disabled).toBe(true);
    expect(finish.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(resume);
    fireEvent.press(finish);
    expect(onResume).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  test("I2 usa un título corto y deja lunchDone en la descripción, en ES y EN", () => {
    const onConfirm = jest.fn();
    setLanguage("es");
    const props = {
      visible: true as const,
      mode: "done" as const,
      minutes: 45,
      startLabel: "12:00 PM",
      endLabel: "12:45 PM",
      onCancel: jest.fn(),
      onConfirm,
    };
    const doneEs = "Ya descontamos 45 min de almuerzo hoy (12:00 PM – 12:45 PM). No lo volvemos a preguntar.";
    const doneEn = "We already deducted 45 min of lunch today (12:00 PM – 12:45 PM). We won't ask again.";
    const view = render(<LunchModal {...props} />);
    expect(t("modals.lunchDoneTitle")).toBe("Almuerzo de hoy");
    expect(screen.getByText("Almuerzo de hoy")).toBeTruthy();
    expect(screen.getByText(doneEs)).toBeTruthy();
    expect(screen.getByText(t("modals.lunchDone", { minutes: 45, start: "12:00 PM", end: "12:45 PM" }))).toBeTruthy();
    expect(screen.queryByTestId("lunch-options")).toBeNull();
    fireEvent.press(screen.getByText(t("cta.finishDay")));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    view.unmount();
    setLanguage("en");
    render(<LunchModal {...props} />);
    expect(t("modals.lunchDoneTitle")).toBe("Today's lunch");
    expect(screen.getByText("Today's lunch")).toBeTruthy();
    expect(screen.getByText(doneEn)).toBeTruthy();
    expect(screen.queryByText(doneEs)).toBeNull();
    expect(screen.queryByText("Almuerzo de hoy")).toBeNull();
    setLanguage("es");
  });

  test("el aviso de almuerzo fuera de la jornada también está en inglés", () => {
    setLanguage("en");
    const sessionStartMs = Date.UTC(2026, 8, 26, 13, 0, 0);
    const sessionEndMs = Date.UTC(2026, 8, 26, 14, 0, 0);
    render(<LunchModal visible mode="close" askStartTime sessionStartMs={sessionStartMs} sessionEndMs={sessionEndMs} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    fireEvent.press(screen.getByLabelText(`30 ${t("common.minutes")}`));
    fireEvent.changeText(screen.getByTestId("lunch-start"), "0640");
    expect(screen.getByText("Lunch has to start and end inside the shift.")).toBeTruthy();
  });
});
