/** Revisar: el fin no puede pasar de ahora y el control anuncia ese tope. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { TimeAuthorityService } from "../../../services/evidence/TimeAuthorityService";
import { OrphanReviewCard } from "../OrphanReviewCard";

describe("OrphanReviewCard", () => {
  test("un fin posterior a ahora se explica y no confirma", () => {
    const onConfirm = jest.fn();
    const startMs = Date.UTC(2026, 8, 26, 14, 0, 0);
    render(<OrphanReviewCard startMs={startMs} nowMs={TimeAuthorityService.now()} onContinue={jest.fn()} onConfirm={onConfirm} />);
    fireEvent.changeText(screen.getByTestId("orphan-end"), "0900");
    fireEvent.changeText(screen.getByTestId("orphan-note"), "me fui");
    expect(screen.getByTestId("orphan-end").props.accessibilityValue.max).toBe(TimeAuthorityService.futureCeiling());
    fireEvent.press(screen.getByText(t("today.orphanConfirm")));
    expect(screen.getByText(t("modals.futureTime"))).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});