import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer, Button } from "../../src/components/ui";
import { useDisclosure } from "../../src/core/hooks/dualTracker";
import { useWorkTracker } from "../../src/core/hooks/useWorkTracker";
import { sessionStore } from "../../src/core/runtime";
import { useToast } from "../../src/context/ToastContext";
import { FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

const TOTAL_STEPS = 4;

function OnboardingStepIndicator({ step }: { step: number }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    stepRow: { flexDirection: "row", gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg },
    stepDot: { flex: 1, height: 4, borderRadius: tokens.radius.round },
  }), [tokens]);
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
        const isActive = index < step;
        return <View key={index} style={[styles.stepDot, { backgroundColor: isActive ? tokens.colors.primary : tokens.colors.surfaceElevated }]} />;
      })}
    </View>
  );
}

export default function DisclosureScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const { text } = useDisclosure("es");
  const { state, dispatch } = useWorkTracker();
  const { showToast } = useToast();
  const [accepted, setAccepted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const paragraphs = text.body.split("\n\n").filter((p) => p.trim().length > 0);

  const styles = useMemo(() => StyleSheet.create({
    header: { paddingHorizontal: tokens.layout.screenPadding, paddingTop: tokens.spacing.xl },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: tokens.layout.screenPadding, paddingBottom: tokens.spacing.xl },
    title: { ...FONT.h2, color: tokens.colors.text.primary, marginBottom: tokens.spacing.lg },
    paragraph: { ...FONT.body, color: tokens.colors.text.secondary, marginBottom: tokens.spacing.md },
    footer: { paddingHorizontal: tokens.layout.screenPadding, paddingTop: tokens.spacing.md, paddingBottom: tokens.spacing.xl, borderTopWidth: 1, borderTopColor: tokens.colors.border },
    checkboxRow: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg, minHeight: tokens.layout.minTouchTarget },
    checkboxLabel: { ...FONT.bodyStrong, color: tokens.colors.text.primary },
    cta: { width: "100%" },
  }), [tokens]);

  const handleConfirm = async () => {
    if (!accepted || isSaving) return;
    setIsSaving(true);
    try {
      await sessionStore.saveSettings({ ...state.domain.settings, disclaimerAccepted: true });
      dispatch({ type: "DISCLAIMER_ACCEPTED" });
      router.push("/(onboarding)/permissions");
    } catch {
      showToast("No se pudo guardar tu aceptación del descargo. Inténtalo de nuevo.", "error");
    } finally { setIsSaving(false); }
  };

  return (
    <ScreenContainer noPadding>
      <View style={styles.header}><OnboardingStepIndicator step={2} /></View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{text.title}</Text>
        {paragraphs.map((paragraph, index) => <Text key={index} style={styles.paragraph}>{paragraph}</Text>)}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.checkboxRow} onPress={() => setAccepted((prev) => !prev)}
          accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} accessibilityLabel="He leído y acepto">
          <Ionicons name={accepted ? "checkbox" : "checkbox-outline"} size={24} color={accepted ? tokens.colors.primary : tokens.colors.text.muted} />
          <Text style={styles.checkboxLabel}>He leído y acepto</Text>
        </Pressable>
        <Button label="Continuar" variant="primary" size="lg" disabled={!accepted} isLoading={isSaving} style={styles.cta} onPress={handleConfirm} />
      </View>
    </ScreenContainer>
  );
}
