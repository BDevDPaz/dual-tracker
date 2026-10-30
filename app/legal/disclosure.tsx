import React, { useMemo } from "react";
import { Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer, PageHeader, Card, Button } from "../../src/components/ui";
import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useDisclosure } from "../../src/core/hooks/dualTracker";

export default function LegalDisclosureScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();
  const { text } = useDisclosure();

  const paragraphs = useMemo(() => text.body.split("\n\n"), [text.body]);

  return (
    <ScreenContainer noPadding>
      <PageHeader title={text.title} subtitle="Solo lectura — ya aceptado" showBack />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          {paragraphs.map((paragraph, index) => (
            <Text
              key={index}
              style={[styles.paragraph, index < paragraphs.length - 1 && styles.paragraphSpacing]}
            >
              {paragraph}
            </Text>
          ))}
        </Card>

        <Button
          label="Volver"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.backButton}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: tokens.layout.screenPadding,
    paddingBottom: tokens.spacing["4xl"],
  },
  card: {
    marginBottom: tokens.spacing.lg,
  },
  paragraph: {
    ...FONT.body,
    color: tokens.colors.text.secondary,
  },
  paragraphSpacing: {
    marginBottom: tokens.spacing.md,
  },
  backButton: {
    marginTop: tokens.spacing.sm,
  },
  });
}
