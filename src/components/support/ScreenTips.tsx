import React, { useEffect, useState } from "react";
import { Text, StyleSheet } from "react-native";
import { Button, Card } from "../ui";
import { TOKENS, FONT } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";
import { tipBodyKey, tipsFor, type TipContext } from "../../support/catalog";
import { dismissTip, isTipDismissed, loadTips, subscribeTips, tipsLoaded } from "../../support/tips";

/** Un consejo a la vez, descartable y recordado. El texto sale de t(), así el idioma lo reescribe. */
export function ScreenTips(ctx: TipContext) {
  useLanguage();
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = subscribeTips(() => setTick((n) => n + 1));
    if (!tipsLoaded()) void loadTips();
    return unsub;
  }, []);

  const id = tipsFor(ctx).find((tip) => !isTipDismissed(tip));
  if (!id) return null;
  return (
    <Card style={styles.card}>
      <Text style={[styles.body, { color: TOKENS.colors.text.primary }]}>{t(tipBodyKey(id))}</Text>
      <Button label={t("support.tips.dismiss")} variant="ghost" size="sm" onPress={() => void dismissTip(id)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.md, gap: TOKENS.spacing.sm },
  body: { ...FONT.body },
});
