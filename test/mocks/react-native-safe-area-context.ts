/**
 * Doble de react-native-safe-area-context: insets controlables en pruebas
 * (`__setInsets`) y SafeAreaView como View plano.
 */
import React from "react";
import { View } from "react-native";

type Insets = { top: number; right: number; bottom: number; left: number };
const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
let insets: Insets = { ...ZERO };

export function __setInsets(next: Partial<Insets>): void {
  insets = { ...insets, ...next };
}
export function __reset(): void {
  insets = { ...ZERO };
}

export const useSafeAreaInsets = () => insets;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 390, height: 844 });
export const initialWindowMetrics = { insets: ZERO, frame: { x: 0, y: 0, width: 390, height: 844 } };
export const SafeAreaInsetsContext = React.createContext<Insets | null>(ZERO);
export const SafeAreaProvider = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
export const SafeAreaView = ({ children, edges: _edges, ...rest }: any) =>
  React.createElement(View, { ...rest, testID: rest.testID ?? "safe-area-view" }, children);
