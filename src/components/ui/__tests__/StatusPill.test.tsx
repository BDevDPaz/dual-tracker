/** Componentes — StatusPill refleja el estado de máquina (vía getSessionStateUI). */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import type { SessionState } from "../../../core/contracts";
import { getSessionStateUI } from "../../../core/selectors";
import { t } from "../../../i18n";
import { ICONS } from "../../../constants/icons";
import { StatusPill, PILL_GLYPH, type StatusTone } from "../StatusPill";

const STATES: SessionState[] = ["NO_INICIADA", "ESPERANDO", "ACTIVA", "PAUSADA", "TRASLADO", "SALIDA", "CERRADA"];

describe("StatusPill", () => {
  test.each(STATES)("estado %s → etiqueta y tono de la tabla de estados", (state) => {
    const ui = getSessionStateUI(state);
    render(<StatusPill tone={ui.tone} label={t(ui.labelKey)} />);
    expect(screen.getByText(t(ui.labelKey).toUpperCase())).toBeTruthy();
  });

  test("SALIDA no se pinta como CERRADA", () => {
    expect(getSessionStateUI("SALIDA").tone).toBe("warning");
    expect(t(getSessionStateUI("SALIDA").labelKey)).not.toBe(t(getSessionStateUI("CERRADA").labelKey));
  });

  test.each<StatusTone>(["neutral", "info", "success", "warning", "danger"])("tono %s: glifo inicial + texto (no solo color)", (tone) => {
    render(<StatusPill tone={tone} label="Estado" />);
    expect(screen.getByTestId(`status-pill-glyph-${tone}`)).toBeTruthy();
    expect(screen.getByText("ESTADO")).toBeTruthy();
    expect(Object.values(ICONS.status)).toContain(PILL_GLYPH[tone]);
  });

  test("cada tono tiene un glifo distinto", () => {
    expect(new Set(Object.values(PILL_GLYPH)).size).toBe(5);
  });
});
