import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useKeyboardScroll } from "./keyboard";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { isValidHHmm, maskHHmm } from "../../utils/hhmm";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Texto de ayuda bajo el campo (se sustituye por el error cuando lo hay). */
  hint?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  containerStyle?: ViewStyle;
  /**
   * Campo secreto con botón mostrar/ocultar (PIN de administración). Implica
   * secureTextEntry mientras está oculto.
   */
  secureToggle?: boolean;
  /**
   * "HH:mm": teclado numérico, dos puntos automáticos ("1230" → "12:30") y,
   * si el valor está completo pero no es una hora válida, se EXPLICA el error
   * (t("common.invalidTime")) en lugar de desactivar el botón en silencio.
   */
  mask?: "HH:mm";
  /** Mensaje para `mask` cuando la hora no es válida (por defecto t("common.invalidTime")). */
  invalidMessage?: string;
  /**
   * Tope del control de hora (instante, no HH:mm). Se anuncia como máximo
   * del campo. La regla de medianoche puede resolver el texto al día
   * siguiente: quien valida el epoch es el modal, con este mismo tope.
   */
  maximumDate?: Date;
}

export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  {
  label,
  error,
  hint,
  icon,
  containerStyle,
  style,
  secureToggle = false,
  mask,
  invalidMessage,
  maximumDate,
  onChangeText,
  onFocus,
  onBlur,
  value,
  ...props
}: InputProps,
  ref,
) {
  const { colors } = useTheme();
  useLanguage();
  const keyboardScroll = useKeyboardScroll();
  const innerRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [touched, setTouched] = useState(false);

  const handleChange = (text: string) => onChangeText?.(mask === "HH:mm" ? maskHHmm(text) : text);
  const setRefs = (node: TextInput | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const handleFocus: NonNullable<TextInputProps["onFocus"]> = (e) => {
    setFocused(true);
    keyboardScroll?.scrollToNode(innerRef.current);
    onFocus?.(e);
  };
  const handleBlur: NonNullable<TextInputProps["onBlur"]> = (e) => {
    setFocused(false);
    setTouched(true);
    onBlur?.(e);
  };

  // HH:mm: error explicado si el valor tiene 5 caracteres (o se abandonó el campo) y no es válido.
  const text = typeof value === "string" ? value : "";
  const maskError =
    mask === "HH:mm" && text.trim() !== "" && (text.length >= 5 || touched) && !isValidHHmm(text)
      ? (invalidMessage ?? t("common.invalidTime"))
      : undefined;
  const shownError = error ?? maskError;

  const borderColor = shownError ? colors.status.danger : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text> : null}

      <View
        testID={props.testID ? `${props.testID}-wrapper` : undefined}
        style={[
          styles.inputWrapper,
          { backgroundColor: colors.surface, borderColor },
          // Anillo de foco: primario al 40 % (outline no desplaza el layout).
          focused && { outlineColor: shownError ? colors.status.danger : colors.focusRing, outlineWidth: TOKENS.layout.focusOutline, outlineStyle: "solid", outlineOffset: 0 },
        ]}
      >
        {icon ? <Ionicons name={icon as any} size={ICON.md} color={colors.text.muted} style={styles.icon} /> : null}
        <TextInput
          ref={setRefs}
          style={[styles.input, { color: colors.text.primary }, mask === "HH:mm" && styles.mono, style]}
          placeholderTextColor={colors.text.muted}
          value={value}
          onChangeText={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
          placeholder={props.placeholder ?? (mask === "HH:mm" ? "HH:mm" : undefined)}
          {...(mask === "HH:mm" ? { keyboardType: "number-pad" as const, maxLength: 5 } : null)}
          {...(maximumDate ? { accessibilityValue: { max: maximumDate.getTime(), text: shownError } } : null)}
          secureTextEntry={secureToggle ? !revealed : props.secureTextEntry}
          accessibilityHint={shownError ?? props.accessibilityHint}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            hitSlop={TOKENS.spacing.md}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t("a11y.hideSecret") : t("a11y.showSecret")}
          >
            <Ionicons name={revealed ? "eye-off-outline" : "eye-outline"} size={ICON.lg} color={colors.text.secondary} />
          </Pressable>
        ) : null}
      </View>

      {shownError ? (
        <Text style={[styles.errorText, { color: colors.status.danger }]} accessibilityLiveRegion="polite">
          {shownError}
        </Text>
      ) : hint ? (
        <Text style={[styles.hintText, { color: colors.text.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: TOKENS.spacing.md,
    width: "100%",
  },
  label: {
    ...FONT.label,
    marginBottom: TOKENS.spacing.xs,
    marginLeft: TOKENS.spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: TOKENS.radius.md,
    borderWidth: TOKENS.layout.hairline,
    paddingHorizontal: TOKENS.spacing.md,
    minHeight: TOKENS.layout.inputMin,
  },
  icon: {
    marginRight: TOKENS.spacing.sm,
  },
  input: {
    flex: 1,
    ...FONT.body,
    paddingVertical: TOKENS.spacing.sm,
  },
  mono: {
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  toggle: {
    marginLeft: TOKENS.spacing.sm,
    minWidth: TOKENS.layout.minTouchTarget,
    minHeight: TOKENS.layout.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    ...FONT.caption,
    marginTop: TOKENS.spacing.xs,
    marginLeft: TOKENS.spacing.xs,
  },
  hintText: {
    ...FONT.caption,
    marginTop: TOKENS.spacing.xs,
    marginLeft: TOKENS.spacing.xs,
  },
});
