/**
 * sites/[id].tsx — Ficha de sitio (Producto §5.11). NUEVO.
 * Datos del destino, editar radio, visitas a ese siteId y archivar.
 * Archivar no borra historial. Intenciones: UPSERT_SITE, ARCHIVE_SITE.
 */
import { useState } from "react";
import { Text, StyleSheet, ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, EmptyState, Input, ScreenContainer, Section } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { TOKENS } from "../../src/constants/theme";
import { useAutoRefresh, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import { selectComputedSessions, selectIsHydrated, selectSiteById, selectSiteLastVisitAtMs, selectVisibleSessions, sessionVisitsSite } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDate } from "../../src/utils/dateUtils";

export default function SiteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  const { state, emit } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const site = Number.isFinite(siteId) ? selectSiteById(state, siteId) : null;
  const [radius, setRadius] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!selectIsHydrated(state)) return <ScreenStatusBanner status="loading" message={t("common.loading")} />;
  if (!site) {
    return (
      <ScreenContainer>
        <EmptyState title={t("sites.notFound")} icon="location-outline" />
        <Button label={t("common.back")} onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const visits = selectComputedSessions(
    state,
    nowMs,
    selectVisibleSessions(state).filter((s) => sessionVisitsSite(s, site.id)),
  );
  const lastVisit = selectSiteLastVisitAtMs(state, site.id);
  const radiusValue = radius ?? String(site.radiusM ?? state.settings.company.defaultRadiusM);
  const radiusDirty = radius !== null && Math.round(Number(radius)) !== (site.radiusM ?? state.settings.company.defaultRadiusM);

  const saveRadius = async () => {
    setBusy(true);
    const res = await emit({
      type: "UPSERT_SITE",
      site: { id: site.id, alias: site.alias, address: site.address, clientName: site.clientName, notes: site.notes, radiusM: Math.round(Number(radius)) },
    });
    setBusy(false);
    if (res.ok) setRadius(null);
  };

  const archive = async () => {
    setBusy(true);
    const res = await emit({ type: "ARCHIVE_SITE", siteId: site.id });
    setBusy(false);
    if (res.ok) router.back();
  };

  return (
    <ScreenContainer noPadding>
      <Stack.Screen options={{ title: site.alias || t("sites.title"), headerRight: () => <HelpButton screen="siteEdit" /> }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
        {!site.active ? <ScreenStatusBanner status="degraded" message={t("sites.archived")} /> : null}
        {site.unreadableFields?.length ? <ScreenStatusBanner status="degraded" message={t("fieldCrypto.unreadableSite")} /> : null}
        <Card style={styles.card}>
          <KeyValueRow label={t("sites.address")} value={site.address} />
          <KeyValueRow label={t("sites.client")} value={site.clientName ?? t("common.notSet")} />
          <KeyValueRow label={t("sites.notes")} value={site.notes ?? t("common.notSet")} />
          <KeyValueRow
            label={t("sites.coords")}
            value={site.targetLat !== null && site.targetLon !== null ? `${site.targetLat.toFixed(5)}, ${site.targetLon.toFixed(5)}` : t("sites.coordsMissing")}
            mono
          />
          <KeyValueRow label={t("sites.lastVisit")} value={lastVisit ? formatDate(lastVisit) : t("sites.never")} />
        </Card>

        {site.active ? (
          <Card style={styles.card}>
            <Input label={t("sites.radius")} value={radiusValue} onChangeText={setRadius} keyboardType="number-pad" />
            {radiusDirty ? <Button label={t("common.save")} size="sm" isLoading={busy} onPress={() => void saveRadius()} /> : null}
          </Card>
        ) : null}

        <Section title={`${t("sites.visits")} (${visits.length})`}>
          {visits.length === 0 ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.noData")}</Text> : null}
          {visits.map((c) => (
            <SessionListItem key={c.session.id} item={c} onPress={() => router.push(`/session/${c.session.id}`)} />
          ))}
        </Section>

        {site.active ? <Button label={t("sites.archive")} variant="danger" disabled={busy} onPress={() => void archive()} /> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: TOKENS.spacing["3xl"] },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
});
