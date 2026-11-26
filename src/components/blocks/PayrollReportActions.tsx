/**
 * PayrollReportActions — bloque «Reporte de nómina» (PR3).
 * Reportes y la vista previa del periodo (/report/[periodId]):
 *  - «Vista previa» abre /report/[periodId] (solo en Reportes).
 *  - «Exportar expediente» = EXPORT_PACK: comparte el comprobante del
 *    empleado del pack vigente; sella antes si la semana no tiene expediente
 *    o el último está desactualizado, y lo reemite si le faltan los PDF.
 *  - «Enviar por correo» = SHARE_EMPLOYER con `ensureFresh` (expediente del
 *    empleador + manifiesto del pack vigente, con el mismo criterio). Sin expediente, se
 *    explica que hay que sellar; sin correo de empresa, se avisa.
 * Solo presenta: la vista decide qué emitir. No lee ni escribe .dtbackup.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";

interface Props {
  onPreview?: () => void;
  onExport: () => void;
  onSend: () => void;
  exportDisabled: boolean;
  /** No hay expediente sellado de la semana: no se puede enviar. */
  needsSeal: boolean;
  noCompanyEmail: boolean;
  onGoSettings: () => void;
  exporting?: boolean;
  sending?: boolean;
}

export function PayrollReportActions({ onPreview, onExport, onSend, exportDisabled, needsSeal, noCompanyEmail, onGoSettings, exporting, sending }: Props) {
  useLanguage();
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <View testID="payroll-report" style={styles.actions}>
        <Text style={[styles.title, { color: colors.text.primary }]}>{t("reports.payrollTitle")}</Text>
        {onPreview ? (
          <>
            <Button testID="payroll-preview" label={t("reports.preview")} iconName="eye-outline" variant="secondary" onPress={onPreview} />
            <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("reports.previewHint")}</Text>
          </>
        ) : null}
        <Button
          testID="payroll-export"
          label={t("reports.exportDossier")}
          iconName="share-outline"
          variant="secondary"
          isLoading={exporting}
          disabled={exportDisabled || exporting}
          onPress={onExport}
        />
        <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("reports.exportDossierHint")}</Text>
        <Button
          testID="payroll-send"
          label={t("reports.sendEmail")}
          iconName="mail-outline"
          variant="secondary"
          isLoading={sending}
          disabled={needsSeal || sending}
          onPress={onSend}
        />
        <Text testID={needsSeal ? "payroll-send-needs-seal" : undefined} style={[styles.hint, { color: colors.text.secondary }]}>
          {needsSeal ? t("reports.sendNeedsSeal") : t("reports.sendEmailHint")}
        </Text>
        {noCompanyEmail ? (
          <Pressable testID="payroll-no-email" accessibilityRole="link" onPress={onGoSettings}>
            <Text style={[styles.hint, { color: colors.statusText.warning }]}>
              {t("reports.noCompanyEmail")} {t("reports.goSettings")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.sm },
  actions: { gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong },
  hint: { ...FONT.caption },
});
