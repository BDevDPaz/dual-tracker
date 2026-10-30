import React from "react";
import { View, StyleSheet, ViewStyle, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useTheme } from "../../context/ThemeContext";

interface ScreenContainerProps {
  children: React.ReactNode;
  noPadding?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  testID?: string;
  useSafeArea?: boolean;
  /**
   * Cuando es true, el contenedor hace scroll y esquiva el teclado.
   * Úsalo en pantallas de formulario (sites/new, onboarding/profile, settings)
   * que hoy son un View fijo y por eso no deslizan y el teclado las tapa.
   * En pantallas como Hoy (tabs/index) que ya tienen su propio scroll interno,
   * deja scrollable={false} y corrige el ScrollView interno en su lugar.
   */
  scrollable?: boolean;
}

export function ScreenContainer({
  children,
  noPadding = false,
  style,
  contentContainerStyle,
  testID,
  useSafeArea = true,
  scrollable = false,
}: ScreenContainerProps) {
  const { tokens } = useTheme();

  const paddingStyle = !noPadding && { paddingHorizontal: tokens.layout.screenPadding };

  const content = scrollable ? (
    <KeyboardAwareScrollView
      style={[styles.scroll, style]}
      contentContainerStyle={[paddingStyle, contentContainerStyle]}
      enableOnAndroid={true}
      extraScrollHeight={24}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID={testID}
    >
      <StatusBar barStyle="light-content" />
      {children}
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.innerContainer, paddingStyle, style]} testID={testID}>
      <StatusBar barStyle="light-content" />
      {children}
    </View>
  );

  if (useSafeArea) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.colors.background }]}>
        {content}
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: tokens.colors.background }]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
});
