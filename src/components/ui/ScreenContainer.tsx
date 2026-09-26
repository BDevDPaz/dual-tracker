import React from "react";
import { View, StyleSheet, ViewStyle, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TOKENS } from "../../constants/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  noPadding?: boolean;
  style?: ViewStyle;
  testID?: string;
  useSafeArea?: boolean;
}

export function ScreenContainer({
  children,
  noPadding = false,
  style,
  testID,
  useSafeArea = true,
}: ScreenContainerProps) {
  const content = (
    <View
      style={[styles.innerContainer, !noPadding && styles.withPadding, style]}
      testID={testID}
    >
      <StatusBar barStyle="light-content" />
      {children}
    </View>
  );

  if (useSafeArea) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: TOKENS.colors.background }]}
      >
        {content}
      </SafeAreaView>
    );
  }

  return (
    <View
      style={[styles.safeArea, { backgroundColor: TOKENS.colors.background }]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  withPadding: {
    paddingHorizontal: TOKENS.layout.screenPadding,
  },
});
