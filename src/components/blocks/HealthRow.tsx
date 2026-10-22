import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { Button } from "../ui/Button";

/** Fila de sensor de system/health.tsx: estado, impacto en integridad y CTA Reparar. */
interface Props {
  label: string;
  value: string;
  ok: boolean;
  blocksValid: boolean;
  busy?: boolean;
  onRepair?: () => void;
  /** Misma guía que el alta (segundo plano, avisos, batería). No sustituye al impacto. */
  guidance?: React.ReactNode;
}

export function HealthRow({ label, value, ok, blocksValid, busy = false, onRepair, guidance }: Props) {
  useLanguage();
  const { colors } = useTheme();
  const color = ok ? colors.status.success : colors.status.warning;
  return (
    <View style={[styles.block, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.label, { color: colors.text.primary }]}>{label}</Text>
          <Text style={[styles.value, { color }]}>{value}</Text>
          <Text style={[styles.impact, { color: blocksValid ? colors.status.warning : colors.text.muted }]}>
            {blocksValid ? t("health.impactBlocking") : t("health.impactWarning")}
          </Text>
          {!ok && blocksValid ? <Text style={[styles.impact, { color: colors.status.warning }]}>{t("health.impactNoValid")}</Text> : null}
        </View>
        {!ok && onRepair ? <Button label={t("health.repair")} size="sm" variant="secondary" disabled={busy} onPress={onRepair} /> : null}
      </View>
      {guidance ? <View style={styles.guidance}>{guidance}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: TOKENS.spacing.md, borderBottomWidth: TOKENS.layout.hairline, gap: TOKENS.spacing.sm },
  row: { flexDirection: "row", alignItems: "center" },
  guidance: { gap: TOKENS.spacing.sm },
  texts: { flex: 1 },
  label: { ...FONT.bodyStrong },
  value: { ...FONT.caption, marginTop: TOKENS.spacing.xxs },
  impact: { ...FONT.caption, marginTop: TOKENS.spacing.xxs },
});
