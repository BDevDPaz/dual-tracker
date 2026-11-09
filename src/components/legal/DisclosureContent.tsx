import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { LegalContent } from "../../i18n/legal";

/**
 * DisclosureContent — contenido del descargo servido por DualDisclosureService.
 * La misma vista se usa en (onboarding)/disclosure.tsx y en legal/disclosure.tsx
 * (modo lectura), para no divergir (Producto §5.4 y §5.17).
 */
export function DisclosureContent({ content, titleAccessory }: { content: LegalContent; titleAccessory?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.titleFlex, { color: colors.text.primary }]}>{content.title}</Text>
        {titleAccessory}
      </View>
      {content.blocks.map((b) => (
        <View key={b.key} style={[styles.block, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.blockTitle, { color: colors.primary }]}>{b.title}</Text>
          <Text style={[styles.body, { color: colors.text.secondary }]}>{b.body}</Text>
        </View>
      ))}
      <Text style={[styles.version, { color: colors.text.muted }]}>v{content.version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  titleFlex: { flex: 1 },
  block: { borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.md },
  blockTitle: { ...FONT.label, marginBottom: TOKENS.spacing.xs },
  body: { ...FONT.bodySmall },
  version: { ...FONT.caption, textAlign: "right", marginTop: TOKENS.spacing.sm },
});
