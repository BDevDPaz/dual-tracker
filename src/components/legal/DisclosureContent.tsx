import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import type { LegalContent } from "../../i18n/legal";

/**
 * DisclosureContent — contenido del descargo servido por DualDisclosureService.
 * La misma vista se usa en (onboarding)/disclosure.tsx y en legal/disclosure.tsx
 * (modo lectura), para no divergir (Producto §5.4 y §5.17).
 */
export function DisclosureContent({ content }: { content: LegalContent }) {
  return (
    <View>
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{content.title}</Text>
      {content.blocks.map((b) => (
        <View key={b.key} style={[styles.block, { borderColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.surface }]}>
          <Text style={[styles.blockTitle, { color: TOKENS.colors.primary }]}>{b.title}</Text>
          <Text style={[styles.body, { color: TOKENS.colors.text.secondary }]}>{b.body}</Text>
        </View>
      ))}
      <Text style={[styles.version, { color: TOKENS.colors.text.muted }]}>v{content.version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  block: { borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.md },
  blockTitle: { ...FONT.label, marginBottom: TOKENS.spacing.xs },
  body: { ...FONT.bodySmall },
  version: { ...FONT.caption, textAlign: "right", marginTop: TOKENS.spacing.sm },
});
