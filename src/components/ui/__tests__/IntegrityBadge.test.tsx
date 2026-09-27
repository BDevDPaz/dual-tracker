/** Componentes (superficie mínima §4.7) — IntegrityBadge refleja VALID/MANUAL/AUTO/CONFLICT. */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import type { IntegrityClass } from "../../../core/contracts";
import { t } from "../../../i18n";
import { IntegrityBadge } from "../IntegrityBadge";

describe("IntegrityBadge", () => {
  test.each<IntegrityClass>(["VALID", "MANUAL", "AUTO", "CONFLICT"])("refleja %s", (cls) => {
    render(<IntegrityBadge integrity={cls} />);
    const label = t(`integrity.${cls}`);
    expect(label).not.toBe(`integrity.${cls}`); // la clave existe
    expect(screen.getByLabelText(`Integridad: ${label}`)).toBeTruthy();
    expect(screen.getByText(label.toUpperCase())).toBeTruthy();
  });

  test("cada clase tiene una etiqueta distinta", () => {
    const labels = new Set((["VALID", "MANUAL", "AUTO", "CONFLICT"] as const).map((c) => t(`integrity.${c}`)));
    expect(labels.size).toBe(4);
  });
});
