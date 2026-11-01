/**
 * (onboarding)/welcome.tsx — Bienvenida.
 * Idioma y tema salen del teléfono; las pastillas los cambian al momento.
 * Un solo botón. Sin columnas ni alcance: eso vive en el aviso.
 */
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { AppBrandTitle, Button, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { ThemeSwitch } from "../../src/components/support/ThemeSwitch";
import { TOKENS } from "../../src/constants/theme";
import { t, useLanguage } from "../../src/i18n";

export default function WelcomeScreen() {
  const router = useRouter();
  useLanguage();
  return (
    <ScreenScroll
      edges={SAFE_EDGES.none}
      footer={<Button label={t("common.continue")} onPress={() => router.push("/(onboarding)/disclosure")} />}
    >
      <View style={styles.titleRow}>
        <AppBrandTitle />
        <HelpButton screen="welcome" />
      </View>
      <LanguageSwitch />
      <ThemeSwitch />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: TOKENS.spacing.sm },
});
