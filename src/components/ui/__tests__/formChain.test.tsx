/** Cadena de foco: "next" avanza, el último campo de una línea es "done" o "search", el multilínea no envía. */
import React from "react";
import { View } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { makeClosedSession } from "../../../../test/fixtures/session.fixture";
import { EditSessionModal } from "../../modals/EditSessionModal";
import { Input } from "../Input";
import { fieldKindProps, isMultilineField, nextFieldAction, useFormFocusChain, type FieldSpec } from "../formChain";
import { FORM_FIELDS, type FormId } from "../formFields";

function Harness({ id, onSubmit, canSubmit = true }: { id: FormId; onSubmit?: () => void; canSubmit?: boolean }) {
  const fields = FORM_FIELDS[id];
  const chain = useFormFocusChain(fields, { onSubmit, canSubmit });
  return (
    <View>
      {fields.map((field) => (
        <Input key={field.id} {...chain.props(field.id)} testID={`${id}-${field.id}`} />
      ))}
    </View>
  );
}

const FORMS = Object.keys(FORM_FIELDS) as FormId[];

describe("nextFieldAction", () => {
  test.each(FORMS)("%s: cada campo de una línea apunta al siguiente o envía; el multilínea inserta un salto", (id) => {
    const fields: readonly FieldSpec[] = FORM_FIELDS[id];
    const singles = fields.filter((field) => !isMultilineField(field));
    fields.forEach((field, index) => {
      const action = nextFieldAction(fields, field.id);
      if (isMultilineField(field)) {
        expect(action).toEqual({ type: "newline" });
        return;
      }
      const last = field.id === singles[singles.length - 1]?.id;
      if (!last) {
        expect(action).toEqual({ type: "focus", target: fields[index + 1].id, returnKeyType: "next" });
      } else {
        expect(action).toEqual({ type: "submit", returnKeyType: field.kind === "search" ? "search" : "done" });
      }
    });
  });

  test("teclado y secreto según el dato", () => {
    expect(fieldKindProps("email").keyboardType).toBe("email-address");
    expect(fieldKindProps("decimal").keyboardType).toBe("decimal-pad");
    expect(fieldKindProps("integer").keyboardType).toBe("number-pad");
    expect(fieldKindProps("time").inputMode).toBe("numeric");
    expect(fieldKindProps("pin").secureTextEntry).toBe(true);
    expect(fieldKindProps("name").autoComplete).toBe("name");
    expect(fieldKindProps("multiline").multiline).toBe(true);
    expect(fieldKindProps("multiline").blurOnSubmit).toBe(false);
    expect(fieldKindProps("search").inputMode).toBe("search");
  });
});

describe("useFormFocusChain", () => {
  test.each(FORMS)("%s pinta returnKeyType, blurOnSubmit y el teclado del catálogo", (id) => {
    render(<Harness id={id} />);
    for (const field of FORM_FIELDS[id]) {
      const node = screen.getByTestId(`${id}-${field.id}`);
      const action = nextFieldAction(FORM_FIELDS[id], field.id);
      if (action.type === "newline") {
        expect(node.props.multiline).toBe(true);
        expect(node.props.blurOnSubmit).toBe(false);
        expect(node.props.submitBehavior).toBe("newline");
      } else {
        expect(node.props.returnKeyType).toBe(action.returnKeyType);
        expect(node.props.blurOnSubmit).toBe(action.type === "submit");
      }
      const kind = "kind" in field ? field.kind : undefined;
      if (kind === "pin") expect(node.props.secureTextEntry).toBe(true);
      if (kind === "email") expect(node.props.keyboardType).toBe("email-address");
      if (kind === "decimal") expect(node.props.keyboardType).toBe("decimal-pad");
      if (kind === "integer" || kind === "time") expect(node.props.keyboardType).toBe("number-pad");
    }
  });

  test("done envía si el formulario es válido y search solo cierra el teclado", () => {
    const save = jest.fn();
    render(<Harness id="settingsPin" onSubmit={save} />);
    fireEvent(screen.getByTestId("settingsPin-pin"), "submitEditing");
    expect(save).toHaveBeenCalledTimes(1);

    save.mockClear();
    render(<Harness id="siteSearch" onSubmit={save} canSubmit={false} />);
    fireEvent(screen.getByTestId("siteSearch-search"), "submitEditing");
    expect(save).not.toHaveBeenCalled();
  });

  test("el último campo de una línea no envía cuando canSubmit es false", () => {
    const save = jest.fn();
    render(<Harness id="onboardingProfile" onSubmit={save} canSubmit={false} />);
    fireEvent(screen.getByTestId("onboardingProfile-reminder"), "submitEditing");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboardingProfile-name").props.returnKeyType).toBe("next");
    expect(screen.getByTestId("onboardingProfile-rate").props.returnKeyType).toBe("next");
    expect(screen.getByTestId("onboardingProfile-reminder").props.returnKeyType).toBe("done");
  });

  test("Enter en una nota no guarda", () => {
    const save = jest.fn();
    render(<Harness id="addNote" onSubmit={save} />);
    fireEvent(screen.getByTestId("addNote-note"), "submitEditing");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("addNote-note").props.blurOnSubmit).toBe(false);
  });

  test("Editar sesión: inicio → fin (done) y la nota no envía", () => {
    const onSave = jest.fn();
    render(
      <EditSessionModal
        visible
        session={makeClosedSession(Date.UTC(2026, 8, 21, 15, 0, 0), 0, { endAtMs: Date.UTC(2026, 8, 21, 23, 0, 0) })}
        onCancel={jest.fn()}
        onSave={onSave}
        checkOverlap={jest.fn().mockResolvedValue(false)}
      />,
    );
    expect(screen.getByTestId("edit-start").props.returnKeyType).toBe("next");
    expect(screen.getByTestId("edit-end").props.returnKeyType).toBe("done");
    expect(screen.getByTestId("edit-end").props.keyboardType).toBe("number-pad");
    expect(screen.getByTestId("edit-note").props.blurOnSubmit).toBe(false);
    expect(screen.getByTestId("edit-note").props.multiline).toBe(true);
    fireEvent(screen.getByTestId("edit-note"), "submitEditing");
    expect(onSave).not.toHaveBeenCalled();
  });
});
