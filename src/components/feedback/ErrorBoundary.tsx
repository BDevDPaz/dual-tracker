/**
 * ErrorBoundary — Límite de render en raíz.
 * Un throw de render no tiene la pantalla de reintento del boot: sin esto
 * la app queda en blanco. Los fallos de intents sí llegan por
 * FeedbackService / FeedbackBridge, y los diálogos de dominio
 * (conflicto, ledger, permiso revocado) no son este caso.
 * Solo envuelve el Stack: FeedbackBridge queda fuera, así sus diálogos
 * de dominio siguen visibles encima de la pantalla de reintento.
 */
import React from "react";
import { Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppBrandTitle, Button } from "../ui";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { boot } from "../../core/boot";
import { LoggingService } from "../../services/persistence/LoggingService";
import { serializeError } from "../../utils/serializeError";
import { t } from "../../i18n";

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top", "bottom", "left", "right"]}>
      <AppBrandTitle />
      <Text style={[styles.status, { color: colors.statusText.danger }]}>{t("boot.error")}</Text>
      <Button label={t("common.retry")} variant="secondary" onPress={onRetry} />
    </SafeAreaView>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    LoggingService.log("ROJO", "UI", "ERROR", "Throw de render atrapado por ErrorBoundary", serializeError(error) + " " + (info.componentStack ?? ""));
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
    void boot();
  };

  render(): React.ReactNode {
    if (this.state.hasError) return <ErrorFallback onRetry={this.handleRetry} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl, gap: TOKENS.spacing.lg },
  status: { ...FONT.caption, textAlign: "center" },
});
