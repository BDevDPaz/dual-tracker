/**
 * report/pack/[packId].tsx — Paquete de evidencia (Producto §5.13). NUEVO.
 * Hash del manifiesto (para que empleado y empleador lo comparen), fecha de
 * sellado, archivos incluidos, sesiones incluidas y compartir PDF empleado /
 * empleador. Sin "regenerar con otras reglas": un pack sellado no muta.
 */
import { Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, EmptyState, Section } from "../../../src/components/ui";
import { BackupAdviceCard, KeyValueRow, ScreenStatusBanner } from "../../../src/components/blocks";
import { TOKENS, FONT } from "../../../src/constants/theme";
import { useAutoRefresh, usePullToRefresh, useQuery, useWorkTracker } from "../../../src/core/hooks";
import { selectPackById, selectPackShared, selectSessionPortion } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { formatCurrency, formatDate, formatDateTime, formatRange } from "../../../src/utils/dateUtils";

export default function PackScreen() {
  const router = useRouter();
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const id = String(packId ?? "");
  const { state, emit, queries } = useWorkTracker();
  const { refreshControl } = usePullToRefresh({ safeArea: "edge" });
  useAutoRefresh();
  const cached = selectPackById(state, id);
  const loaded = useQuery(() => (cached ? Promise.resolve(cached) : queries.loadPack(id)), [id, cached], ["packs"]);
  const pack = cached ?? loaded.data;
  const sessions = useQuery(() => (pack ? queries.packSessions(pack) : Promise.resolve([])), [pack?.id], ["sessions"]);

  if (!pack && loaded.loading) return <ScreenStatusBanner status="loading" message={t("common.loading")} />;
  if (!pack) {
    return (
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <EmptyState title={t("report.notFound")} icon="document-outline" />
        <Button label={t("notFound.goHome")} onPress={() => router.replace("/(tabs)")} />
      </ScrollView>
    );
  }
  const m = pack.manifest;
  const shared = selectPackShared(state, pack.id);

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
      {!m.certified ? <ScreenStatusBanner status="conflict" message={t("report.uncertified")} /> : null}
      {m.sealedAtMs <= m.periodEnd ? <ScreenStatusBanner status="degraded" message={t("reports.packEarly")} /> : null}
      {m.sealWarnings?.length ? <ScreenStatusBanner status="degraded" message={t("fieldCrypto.sealWarning")} /> : null}
      <Card style={styles.card}>
        <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("report.hash")}</Text>
        <Text selectable style={[styles.hash, { color: TOKENS.colors.primary }]}>
          {m.packHash}
        </Text>
        <Text style={[styles.caption, { color: TOKENS.colors.text.muted }]}>{t("report.hashHint")}</Text>
      </Card>
      <Card style={styles.card}>
        <KeyValueRow label={t("report.sealedAt")} value={formatDateTime(m.sealedAtMs)} />
        <KeyValueRow label={t("reports.title")} value={formatRange(m.periodStart, m.periodEnd)} />
        <KeyValueRow label={t("session.policy")} value={m.policyId} />
        <KeyValueRow label={t("reports.total")} value={formatCurrency(pack.statement.grossEstimate)} emphasis />
        <KeyValueRow label={t("reports.integrity")} value={t(m.certified ? "report.certified" : "report.uncertified")} />
      </Card>

      <Section title={t("report.files")}>
        {m.files.map((f) => (
          <KeyValueRow key={f.name} label={f.role} value={f.name} mono />
        ))}
      </Section>

      <Section title={`${t("report.sessions")} (${m.sessionIds.length})`}>
        {(sessions.data ?? []).map((s) => {
          const slice = selectSessionPortion(state, m.policyId, m.periodStart, m.periodEnd, s, m.sealedAtMs);
          const when = slice ? formatDate(slice.displayStartMs) : s.bookkeeping.dateString;
          const cont =
            slice?.continuesFromMs != null
              ? ` · ${t("history.continuesFrom", { date: formatDate(slice.continuesFromMs) })}`
              : slice?.continuesUntilMs != null
                ? ` · ${t("history.continuesUntil", { date: formatDate(slice.continuesUntilMs) })}`
                : "";
          return <KeyValueRow key={s.id} label={`#${s.id} · ${when}${cont}`} value={t(`integrity.${s.integrityClass}`)} />;
        })}
      </Section>

      {!shared ? <BackupAdviceCard /> : null}
      <Button label={t("reports.shareEmployee")} iconName="share-outline" onPress={() => void emit({ type: "SHARE_EMPLOYEE", packId: pack.id })} />
      <Button label={t("reports.shareEmployer")} variant="secondary" iconName="briefcase-outline" onPress={() => void emit({ type: "SHARE_EMPLOYER", packId: pack.id })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: TOKENS.spacing["3xl"] },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
  label: { ...FONT.label },
  hash: { fontFamily: "monospace", fontSize: 13, lineHeight: 20 },
  caption: { ...FONT.caption },
});
