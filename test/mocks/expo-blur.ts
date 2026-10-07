/** Doble de expo-blur: BlurView como View que expone tint/intensity. */
import React from "react";
import { View } from "react-native";

export const BlurView = ({ children, ...rest }: any) => React.createElement(View, rest, children);
