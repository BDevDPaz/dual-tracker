import { useCallback, useRef } from "react";
import { Keyboard, Platform, type TextInput, type TextInputProps } from "react-native";

export type FieldKind = "text" | "name" | "email" | "decimal" | "integer" | "pin" | "time" | "search" | "multiline";

export type FieldSpec = {
  id: string;
  kind?: FieldKind;
  multiline?: boolean;
};

export type FocusAction =
  | { type: "focus"; target: string; returnKeyType: "next" }
  | { type: "submit"; returnKeyType: "done" | "search" }
  | { type: "newline" };

export function isMultilineField(field: FieldSpec): boolean {
  return field.multiline === true || field.kind === "multiline";
}

/**
 * Orden de foco de un formulario.
 * - Un campo de una línea que no es el último de una línea: "next" y enfoca el siguiente campo (aunque sea multilínea).
 * - El último campo de una línea: "done" (o "search"), cierra el teclado y, si el formulario es válido, guarda.
 * - Multilínea: Enter inserta un salto; no envía.
 */
export function nextFieldAction(fields: readonly FieldSpec[], id: string): FocusAction {
  const index = fields.findIndex((field) => field.id === id);
  const field = fields[index];
  if (!field || isMultilineField(field)) return { type: "newline" };
  const single = fields.filter((item) => !isMultilineField(item));
  const lastSingle = single[single.length - 1];
  if (field.id !== lastSingle?.id) {
    const next = fields[index + 1];
    if (next) return { type: "focus", target: next.id, returnKeyType: "next" };
  }
  return { type: "submit", returnKeyType: field.kind === "search" ? "search" : "done" };
}

/** Teclado, autofill y secreto según el tipo de dato. La máscara HH:mm puede pisar el teclado. */
export function fieldKindProps(kind: FieldKind = "text"): Partial<TextInputProps> {
  switch (kind) {
    case "name":
      return { autoCapitalize: "words", autoComplete: "name", textContentType: "name", inputMode: "text", keyboardType: "default" };
    case "email":
      return {
        autoCapitalize: "none",
        autoCorrect: false,
        autoComplete: "email",
        textContentType: "emailAddress",
        inputMode: "email",
        keyboardType: "email-address",
      };
    case "decimal":
      return { keyboardType: "decimal-pad", inputMode: "decimal", autoComplete: "off", autoCorrect: false };
    case "integer":
      return { keyboardType: "number-pad", inputMode: "numeric", autoComplete: "off", autoCorrect: false };
    case "pin":
      return {
        keyboardType: "number-pad",
        inputMode: "numeric",
        secureTextEntry: true,
        autoComplete: "off",
        autoCapitalize: "none",
        autoCorrect: false,
        textContentType: Platform.OS === "ios" ? "password" : "none",
      };
    case "time":
      return { keyboardType: "number-pad", inputMode: "numeric", autoComplete: "off", autoCorrect: false, textContentType: "none" };
    case "search":
      return { autoCapitalize: "none", autoCorrect: false, autoComplete: "off", inputMode: "search", keyboardType: "default" };
    case "multiline":
      return { multiline: true, blurOnSubmit: false, textAlignVertical: "top" };
    case "text":
    default:
      return { autoCapitalize: "sentences", inputMode: "text", keyboardType: "default" };
  }
}

export type ChainProps = Partial<TextInputProps> & { ref: (node: TextInput | null) => void };

export function useFormFocusChain(
  fields: readonly FieldSpec[],
  opts: { onSubmit?: () => void; canSubmit?: boolean } = {},
) {
  const refs = useRef<Record<string, TextInput | null>>({});
  const onSubmitRef = useRef(opts.onSubmit);
  const canSubmitRef = useRef(opts.canSubmit);
  onSubmitRef.current = opts.onSubmit;
  canSubmitRef.current = opts.canSubmit;

  const props = useCallback(
    (id: string): ChainProps => {
      const field = fields.find((item) => item.id === id);
      const kind = field?.kind ?? (field && isMultilineField(field) ? "multiline" : "text");
      const action = nextFieldAction(fields, id);
      const kindProps = fieldKindProps(kind);
      const ref = (node: TextInput | null) => {
        refs.current[id] = node;
      };
      if (action.type === "newline") {
        return { ...kindProps, ref, multiline: true, blurOnSubmit: false, submitBehavior: "newline" };
      }
      if (action.type === "focus") {
        return {
          ...kindProps,
          ref,
          returnKeyType: "next",
          blurOnSubmit: false,
          submitBehavior: "submit",
          onSubmitEditing: () => refs.current[action.target]?.focus?.(),
        };
      }
      return {
        ...kindProps,
        ref,
        returnKeyType: action.returnKeyType,
        blurOnSubmit: true,
        submitBehavior: "blurAndSubmit",
        onSubmitEditing: () => {
          Keyboard.dismiss();
          if (canSubmitRef.current !== false) onSubmitRef.current?.();
        },
      };
    },
    [fields],
  );

  return { props, refs };
}
