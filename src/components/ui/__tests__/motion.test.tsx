/** useMotionPreference / useReduceTransparency / haptics protegidos. */
import React from "react";
import { AccessibilityInfo, Platform, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { ReduceMotionPref, haptics, useMotionPreference } from "../motion";

function Probe() {
  const reduced = useMotionPreference();
  return <Text testID="probe">{reduced ? "reduced" : "full"}</Text>;
}

describe("useMotionPreference", () => {
  test("lee AccessibilityInfo.isReduceMotionEnabled (async) y reacciona al listener", async () => {
    let listener: ((v: boolean) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((event: string, cb: (v: boolean) => void) => {
      if (event === "reduceMotionChanged") listener = cb;
      return { remove };
    }) as never);

    render(<Probe />);
    expect(screen.getByTestId("probe").props.children).toBe("full");
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("probe").props.children).toBe("reduced");

    act(() => listener?.(false));
    expect(screen.getByTestId("probe").props.children).toBe("full");

    ReduceMotionPref.__reset();
    expect(remove).toHaveBeenCalled();
  });

  test("__set fija el valor para todos los consumidores", () => {
    render(<Probe />);
    act(() => ReduceMotionPref.__set(true));
    expect(screen.getByTestId("probe").props.children).toBe("reduced");
  });
});

describe("haptics", () => {
  test("sin hápticos con movimiento reducido", () => {
    const spy = jest.spyOn(Haptics, "impactAsync").mockResolvedValue(undefined);
    haptics.impact(Haptics.ImpactFeedbackStyle.Light, true);
    expect(spy).not.toHaveBeenCalled();
    haptics.impact(Haptics.ImpactFeedbackStyle.Light, false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("nunca en web", () => {
    const spy = jest.spyOn(Haptics, "notificationAsync").mockResolvedValue(undefined);
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    try {
      haptics.notify(Haptics.NotificationFeedbackType.Warning, false);
    } finally {
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test("un fallo del motor háptico no rompe la pulsación", () => {
    jest.spyOn(Haptics, "impactAsync").mockImplementation(() => {
      throw new Error("no haptics");
    });
    expect(() => haptics.impact(Haptics.ImpactFeedbackStyle.Medium, false)).not.toThrow();
  });
});
