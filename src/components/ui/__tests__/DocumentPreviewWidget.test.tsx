/** DocumentPreviewWidget — líneas reales, i18n y fila del hash (solo el hash del paquete). */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { setLanguage, t } from "../../../i18n";
import { DocumentPreviewWidget } from "../DocumentPreviewWidget";

const HASH = "a".repeat(52) + "0123456789ab";
const base = { employeeName: "Ana", dateRange: "r", totalHours: "8.00 h", totalEarnings: "$200.00" };

afterEach(() => setLanguage("es"));

describe("DocumentPreviewWidget", () => {
  test("sin líneas: esqueleto; con líneas: las dos primeras reales", () => {
    const { rerender } = render(<DocumentPreviewWidget {...base} />);
    expect(screen.getAllByTestId("preview-skeleton")).toHaveLength(4);
    rerender(
      <DocumentPreviewWidget
        {...base}
        lines={[
          { label: "Regulares", value: "8.00 h" },
          { label: "Horas extra", value: "1.00 h" },
          { label: "Tránsito", value: "0.50 h" },
        ]}
      />,
    );
    expect(screen.queryByTestId("preview-skeleton")).toBeNull();
    expect(screen.getAllByTestId("preview-line")).toHaveLength(2);
    expect(screen.queryByText("Tránsito")).toBeNull();
  });

  test("etiquetas por t() (EN)", () => {
    setLanguage("en");
    render(<DocumentPreviewWidget {...base} certified={false} />);
    expect(screen.getByText("Report preview")).toBeTruthy();
    expect(screen.getByText("Pay statement · NOT CERTIFIED")).toBeTruthy();
    expect(screen.getByText("Total hours: 8.00 h")).toBeTruthy();
  });

  test("sin packHash no hay fila de hash", () => {
    render(<DocumentPreviewWidget {...base} />);
    expect(screen.queryByTestId("preview-hash")).toBeNull();
  });

  test("fila del hash: 12 últimos caracteres, copia el hash completo y avisa con la cola", async () => {
    const onHashCopied = jest.fn();
    render(<DocumentPreviewWidget {...base} packHash={HASH} onHashCopied={onHashCopied} />);
    expect(screen.getByText("…0123456789ab")).toBeTruthy();
    expect(screen.getByLabelText(t("report.copyHashA11y", { hash: "0123456789ab" }))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("preview-hash"));
    });
    const clip = require("expo-clipboard") as typeof import("../../../../test/mocks/expo-clipboard");
    expect(clip.__copied).toEqual([HASH]);
    expect(onHashCopied).toHaveBeenCalledWith("0123456789ab");
  });
});
