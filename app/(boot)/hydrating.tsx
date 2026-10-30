import React, { useEffect, useMemo } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { AppBrandTitle, ScreenContainer } from "../../src/components/ui";
import { useWorkTracker } from "../../src/core/hooks/useWorkTracker";
import { selectIsHydrated } from "../../src/core/selectors";
import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

/**
 * app/(boot)/hydrating.tsx — Pantalla de rehidratación (Propuesta capa app
 * §5.2). Su único trabajo es esperar a que SQLite y el ledger terminen de
 * cargar y devolver el control al gate ("/"). Nunca ofrece "Iniciar
 * jornada": si la rehidratación revela una sesión ACTIVA, es Hoy (no esta
 * pantalla) quien la muestra ya en ese estado.
 */
export default function HydratingScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();
  const { state } = useWorkTracker();
  const isHydrated = selectIsHydrated(state);

  useEffect(() => {
    if (isHydrated) {
      router.replace("/");
    }
  }, [isHydrated, router]);

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.content}>
        <AppBrandTitle subtitle="CONTROL DE JORNADA" />

        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.statusText}>Restaurando expediente…</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing["2xl"],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  statusText: {
    ...FONT.body,
    color: tokens.colors.text.secondary,
  },
  });
}
