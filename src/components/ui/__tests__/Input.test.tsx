/** Input — máscara HH:mm, error explicado y botón mostrar/ocultar del PIN. */
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { isValidHHmm, maskHHmm } from "../../../utils/hhmm";
import { Input } from "../Input";

function Controlled(props: Partial<React.ComponentProps<typeof Input>>) {
  const [v, setV] = useState("");
  return <Input testID="in" value={v} onChangeText={setV} {...props} />;
}

describe("maskHHmm", () => {
  test.each([
    ["1230", "12:30"],
    ["12:30", "12:30"],
    ["1", "1"],
    ["12", "12"],
    ["123", "12:3"],
    ["12345", "12:34"],
    ["ab9x", "9"],
    ["", ""],
  ])("%s → %s", (raw, out) => expect(maskHHmm(raw)).toBe(out));

  test("validación 24 h", () => {
    expect(isValidHHmm("00:00")).toBe(true);
    expect(isValidHHmm("23:59")).toBe(true);
    expect(isValidHHmm("24:00")).toBe(false);
    expect(isValidHHmm("12:60")).toBe(false);
    expect(isValidHHmm("9:30")).toBe(false);
  });
});

describe("Input mask=HH:mm", () => {
  test("teclear 1230 da 12:30 con teclado numérico", () => {
    render(<Controlled mask="HH:mm" />);
    const input = screen.getByTestId("in");
    expect(input.props.keyboardType).toBe("number-pad");
    expect(input.props.maxLength).toBe(5);
    fireEvent.changeText(input, "1230");
    expect(screen.getByTestId("in").props.value).toBe("12:30");
    expect(screen.queryByText(t("common.invalidTime"))).toBeNull();
  });

  test("hora completa inválida → se explica el error (no se desactiva en silencio)", () => {
    render(<Controlled mask="HH:mm" />);
    fireEvent.changeText(screen.getByTestId("in"), "2575");
    expect(screen.getByTestId("in").props.value).toBe("25:75");
    expect(screen.getByText(t("common.invalidTime"))).toBeTruthy();
  });

  test("incompleta: sin error mientras se escribe, con error al salir del campo", () => {
    render(<Controlled mask="HH:mm" />);
    fireEvent.changeText(screen.getByTestId("in"), "12");
    expect(screen.queryByText(t("common.invalidTime"))).toBeNull();
    fireEvent(screen.getByTestId("in"), "blur");
    expect(screen.getByText(t("common.invalidTime"))).toBeTruthy();
  });
});

describe("Input secureToggle", () => {
  test("oculto por defecto; el botón alterna mostrar/ocultar", () => {
    render(<Controlled secureToggle />);
    expect(screen.getByTestId("in").props.placeholder).toBe("••••");
    expect(screen.getByTestId("in").props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText(t("a11y.showSecret")));
    expect(screen.getByTestId("in").props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByLabelText(t("a11y.hideSecret")));
    expect(screen.getByTestId("in").props.secureTextEntry).toBe(true);
  });
});
