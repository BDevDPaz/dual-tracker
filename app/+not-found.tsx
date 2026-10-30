import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer, Button } from "../src/components/ui";
import { FONT, type AppTokens } from "../src/constants/theme";
import { useTheme } from "../src/context/ThemeContext";

/**
 * app/+not-found.tsx — Pantalla de degradación cuando un deep link apunta a
 * un sessionId o packId que ya no existe (borrado o inválido). Un único CTA
 * primario devuelve al usuario a Hoy (Propuesta capa app §3.1).
 */
export default function NotFoundScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="link-outline" size={56} color={tokens.colors.text.muted} />
        </View>

        <Text style={styles.title}>Este enlace ya no es válido</Text>
        <Text style={styles.description}>
          La sesión o el expediente al que apunta este enlace fue eliminado o ya no existe en tu
          dispositivo. Puede tratarse de una jornada borrada o de un paquete de evidencia que ya se
          reemplazó.
        </Text>

        <Button
          label="Volver a Hoy"
          variant="primary"
          size="lg"
          style={styles.cta}
          onPress={() => router.replace("/(tabs)")}
        />
      </View>
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing.xl,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.round,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.spacing.xl,
  },
  title: {
    ...FONT.h2,
    color: tokens.colors.text.primary,
    textAlign: "center",
    marginBottom: tokens.spacing.sm,
  },
  description: {
    ...FONT.body,
    color: tokens.colors.text.secondary,
    textAlign: "center",
    marginBottom: tokens.spacing["2xl"],
  },
  cta: {
    width: "100%",
  },
  });
}
