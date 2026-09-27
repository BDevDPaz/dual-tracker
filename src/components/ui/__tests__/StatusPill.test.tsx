/** Componentes — StatusPill refleja el estado de máquina (vía getSessionStateUI). */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import type { SessionState } from "../../../core/contracts";
import { getSessionStateUI } from "../../../core/selectors";
import { t } from "../../../i18n";
import { StatusPill } from "../StatusPill";

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
});
