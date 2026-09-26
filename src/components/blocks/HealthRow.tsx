import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { t } from "../../i18n";
import { Button } from "../ui/Button";

/** Fila de sensor de system/health.tsx: estado, impacto en integridad y CTA Reparar. */
interface Props {
  label: string;
  value: string;
  ok: boolean;
  blocksValid: boolean;
  onRepair?: () => void;
}

export function HealthRow({ label, value, ok, blocksValid, onRepair }: Props) {
  const color = ok ? TOKENS.colors.status.success : TOKENS.colors.status.warning;
  return (
    <View style={[styles.row, { borderColor: TOKENS.colors.border }]}>
      <View style={styles.texts}>
        <Text style={[styles.label, { color: TOKENS.colors.text.primary }]}>{label}</Text>
        <Text style={[styles.value, { color }]}>{value}</Text>
        {!ok && blocksValid ? <Text style={[styles.impact, { color: TOKENS.colors.status.warning }]}>{t("health.impactNoValid")}</Text> : null}
      </View>
      {!ok && onRepair ? <Button label={t("health.repair")} size="sm" variant="secondary" onPress={onRepair} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: TOKENS.spacing.md, borderBottomWidth: 1 },
  texts: { flex: 1 },
  label: { ...FONT.bodyStrong },
  value: { ...FONT.caption, marginTop: 2 },
  impact: { ...FONT.caption, marginTop: 2 },
});
