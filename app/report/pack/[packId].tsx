/**
 * report/pack/[packId].tsx — Paquete de evidencia (Producto §5.13). NUEVO.
 * Hash del manifiesto (para que empleado y empleador lo comparen), fecha de
 * sellado, archivos incluidos, sesiones incluidas y compartir PDF empleado /
 * empleador. Sin "regenerar con otras reglas": un pack sellado no muta. Si al
 * pack le faltan los PDF (copia restaurada), «Volver a emitir» crea uno nuevo.
 * «Ver estado de nómina» abre la vista previa del periodo (/report/[periodId]).
 */
import { useState } from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, NotFoundState, SAFE_EDGES, ScreenContainer, ScreenScroll, SealAnimation, Section, StatusPill } from "../../../src/components/ui";
import { BackupAdviceCard, KeyValueRow, ScreenStatusBanner } from "../../../src/components/blocks";
import { TOKENS, FONT } from "../../../src/constants/theme";
import { useTheme } from "../../../src/context/ThemeContext";
import { useAutoRefresh, useBusyAction, usePullToRefresh, useQuery, useWorkTracker } from "../../../src/core/hooks";
import { selectCalendarHistory, selectPackById, selectPackShared, selectPackTermsFrozen, selectSessionPortion } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { tPackFileRole } from "../../../src/i18n/labels";
import { formatCurrency, formatDate, formatDateTime, formatRange, weekPeriodId } from "../../../src/utils/dateUtils";

export default function PackScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { packId, sealed } = useLocalSearchParams<{ packId: string; sealed?: string }>();
  const [showSeal, setShowSeal] = useState(sealed === "1");
  const [annexLedger, setAnnexLedger] = useState(false);
  const [annexEnterExit, setAnnexEnterExit] = useState(false);
  const { busy: sharing, run: share } = useBusyAction();
  const { busy: reissuing, run: runReissue } = useBusyAction();
  const id = String(packId ?? "");
  const { state, emit, queries } = useWorkTracker();
  const { refreshControl } = usePullToRefresh({ safeArea: "edge" });
  useAutoRefresh();
  const cached = selectPackById(state, id);
  const loaded = useQuery(() => (cached ? Promise.resolve(cached) : queries.loadPack(id)), [id, cached], ["packs"]);
  const pack = cached ?? loaded.data;
  const sessions = useQuery(() => (pack ? queries.packSessions(pack) : Promise.resolve([])), [pack?.id], ["sessions"]);

  if (!pack && loaded.loading) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }
  if (!pack) {
    return (
      <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
        <NotFoundState title={t("report.notFound")} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/reports"))} />
      </ScreenScroll>
    );
  }
  const m = pack.manifest;
  const shared = selectPackShared(state, pack.id);
  const premium = (m.documentVersion ?? 1) >= 2;
  const annex = premium ? { annexLedger, annexEnterExit } : {};
  // RR-2: tras restaurar una copia en otro teléfono el pack no trae sus PDF.
  // La salida es la reemisión (pack nuevo, asiento PACK_REISSUED), con el mismo
  // criterio de certificación que este pack.
  const pdfMissing = !pack.employeePdfUri || !pack.employerPdfUri;
  const reissue = () =>
    runReissue(async () => {
      const res = await emit({ type: "SEAL_PACK", periodStart: m.periodStart, periodEnd: m.periodEnd, allowUncertified: !m.certified, reissue: true });
      const next = res.ok ? (res.data as { id?: unknown } | undefined) : undefined;
      if (next && typeof next.id === "string") router.replace({ pathname: "/report/pack/[packId]", params: { packId: next.id, sealed: "1" } });
      return res;
    });

  return (
    <View style={styles.root}>
    <SealAnimation visible={showSeal} onDone={() => setShowSeal(false)} />
    <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
      {!m.certified ? <ScreenStatusBanner status="conflict" message={t("report.uncertified")} /> : null}
      {m.sealedAtMs <= m.periodEnd ? <ScreenStatusBanner status="degraded" message={t("reports.packEarly")} /> : null}
      {m.sealWarnings?.length ? <ScreenStatusBanner status="degraded" message={t("fieldCrypto.sealWarning")} /> : null}
      {!selectPackTermsFrozen(pack) ? <ScreenStatusBanner status="degraded" message={t("report.termsNotFrozen")} /> : null}
      <Card style={styles.card}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>{t("report.hash")}</Text>
        <Text selectable style={[styles.hash, { color: colors.primary }]}>
          {m.packHash}
        </Text>
        <Text style={[styles.caption, { color: colors.text.muted }]}>{t("report.hashHint")}</Text>
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
          <KeyValueRow key={f.name} label={tPackFileRole(f.role)} value={f.name} mono />
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

      {premium ? (
        <Section title={t("report.annexTitle")}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: annexLedger }}
            accessibilityLabel={t("report.annexLedger")}
            onPress={() => setAnnexLedger((v) => !v)}
            style={styles.switchRow}
          >
            <Text style={{ color: colors.text.primary }}>{t("report.annexLedger")}</Text>
            <StatusPill tone={annexLedger ? "success" : "neutral"} label={t(annexLedger ? "report.annexOn" : "report.annexOff")} />
          </Pressable>
          <Text style={[styles.caption, { color: colors.text.muted }]}>{t("report.annexLedgerHint")}</Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: annexEnterExit }}
            accessibilityLabel={t("report.annexEnterExit")}
            onPress={() => setAnnexEnterExit((v) => !v)}
            style={styles.switchRow}
          >
            <Text style={{ color: colors.text.primary }}>{t("report.annexEnterExit")}</Text>
            <StatusPill tone={annexEnterExit ? "success" : "neutral"} label={t(annexEnterExit ? "report.annexOn" : "report.annexOff")} />
          </Pressable>
          <Text style={[styles.caption, { color: colors.text.muted }]}>{t("report.annexEnterExitHint")}</Text>
        </Section>
      ) : null}

      {!shared ? <BackupAdviceCard /> : null}
      <Button
        testID="pack-view-statement"
        label={t("reports.viewStatement")}
        variant="ghost"
        iconName="eye-outline"
        onPress={() => router.push(`/report/${weekPeriodId(m.periodStart, selectCalendarHistory(state))}`)}
      />
      {pdfMissing ? (
        <>
          <ScreenStatusBanner status="degraded" message={t("report.pdfMissing")} />
          <Button
            testID="pack-reissue"
            label={t("report.reissue")}
            iconName="refresh-outline"
            disabled={reissuing}
            isLoading={reissuing}
            onPress={() => void reissue()}
          />
        </>
      ) : null}
      <Button
        testID="pack-share-employee"
        label={t("reports.shareEmployee")}
        iconName="share-outline"
        disabled={sharing || pdfMissing}
        isLoading={sharing}
        onPress={() => void share(() => emit({ type: "SHARE_EMPLOYEE", packId: pack.id, ...annex }))}
      />
      <Button
        label={t("reports.shareEmployer")}
        variant="secondary"
        iconName="briefcase-outline"
        disabled={sharing || pdfMissing}
        onPress={() => void share(() => emit({ type: "SHARE_EMPLOYER", packId: pack.id, ...annex }))}
      />
    </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
  label: { ...FONT.label },
  hash: { ...FONT.caption, fontFamily: "monospace" },
  caption: { ...FONT.caption },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm, minHeight: TOKENS.layout.minTouchTarget },
});
