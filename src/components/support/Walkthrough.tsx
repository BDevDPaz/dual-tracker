import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ArrivalMark } from "../brand/ArrivalMark";
import { Button, Card } from "../ui";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import type { GuideStep } from "../../support/catalog";
import type { FlowId } from "../../support/types";

interface WalkthroughProps {
  title: string;
  steps: readonly GuideStep[];
  /** Si se indica, el último paso ofrece practicar ese flujo. */
  practiceFlow?: FlowId;
  /** Símbolo de llegada confirmada (concepto D) en la guía de llegada. */
  emblem?: "arrival";
}

/**
 * Recorrido en el sistema de diseño: tarjeta, contador y un control resaltado
 * (coach mark) con el mismo borde y color de acento que el resto de la app.
 */
export function Walkthrough({ title, steps, practiceFlow, emblem }: WalkthroughProps) {
  useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, Math.max(steps.length - 1, 0))];
  if (!step) return null;
  const last = index >= steps.length - 1;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.kicker, { color: colors.text.muted }]}>{t("support.walk.step", { n: index + 1, total: steps.length })}</Text>
      {emblem === "arrival" ? <ArrivalMark size={ICON.hero} /> : null}
      <Text testID="walk-title" style={[styles.title, { color: colors.text.primary }]}>
        {t(title)}
      </Text>
      <Card style={styles.card}>
        <Text style={[styles.stepTitle, { color: colors.text.primary }]}>{t(step.title)}</Text>
        <Text testID="walk-body" style={[styles.body, { color: colors.text.secondary }]}>
          {t(step.body)}
        </Text>
        <Text style={[styles.look, { color: colors.text.muted }]}>{t("support.walk.lookFor")}</Text>
        <View testID="walk-mark" style={[styles.mark, { borderColor: colors.primary }]}>
          <Text style={[styles.markText, { color: colors.primary }]}>{t(step.mark)}</Text>
        </View>
      </Card>
      <View style={styles.row}>
        {index > 0 ? <Button label={t("support.walk.back")} variant="ghost" onPress={() => setIndex((n) => Math.max(0, n - 1))} /> : null}
        {last ? (
          <Button label={t("support.walk.done")} onPress={() => router.back()} />
        ) : (
          <Button label={t("support.walk.next")} onPress={() => setIndex((n) => Math.min(steps.length - 1, n + 1))} />
        )}
      </View>
      {last && practiceFlow ? (
        <Button label={t("support.walk.practice")} variant="secondary" onPress={() => router.push("/support/practice")} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.md },
  kicker: { ...FONT.label, letterSpacing: 1 },
  title: { ...FONT.h2 },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  stepTitle: { ...FONT.bodyStrong },
  body: { ...FONT.body },
  look: { ...FONT.caption, marginTop: TOKENS.spacing.sm },
  mark: {
    borderWidth: 2,
    borderRadius: TOKENS.radius.md,
    paddingVertical: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.lg,
    alignItems: "center",
  },
  markText: { ...FONT.bodyStrong },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: TOKENS.spacing.sm },
});
