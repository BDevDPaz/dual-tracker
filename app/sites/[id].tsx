/**
 * sites/[id].tsx — Ficha de sitio (Producto §5.11). NUEVO.
 * Datos del destino, editar radio, visitas a ese siteId y archivar.
 * Archivar no borra historial. Intenciones: UPSERT_SITE, ARCHIVE_SITE.
 */
import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, EmptyState, Input, SAFE_EDGES, ScreenContainer, ScreenScroll, Section } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
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
  const [dwell, setDwell] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const storedRadius = site?.radiusM ?? state.settings.company.defaultRadiusM;
  const radiusValue = radius ?? String(storedRadius);
  const radiusNum = Math.round(Number(radiusValue));
  const storedDwell = site?.arrivalDwellMs == null ? "" : String(Math.round(site.arrivalDwellMs / 60_000));
  const dwellValue = dwell ?? storedDwell;
  const dwellMs = dwellValue.trim() === "" ? null : Math.min(30, Math.max(0, Math.round(Number(dwellValue.replace(",", ".")) || 0))) * 60_000;
  const radiusDirty = site != null && radius !== null && radiusNum !== storedRadius;
  const dwellDirty = site != null && dwell !== null && dwellMs !== (site.arrivalDwellMs ?? null);
  const formDirty = radiusDirty || dwellDirty;

  const saveRadius = async () => {
    if (!site) return;
    setBusy(true);
    const res = await emit({
      type: "UPSERT_SITE",
      site: {
        id: site.id,
        alias: site.alias,
        address: site.address,
        clientName: site.clientName,
        notes: site.notes,
        radiusM: radiusNum,
        arrivalDwellMs: dwellMs,
      },
    });
    setBusy(false);
    if (res.ok) {
      setRadius(null);
      setDwell(null);
    }
  };
  const chain = useFormFocusChain(FORM_FIELDS.siteRadius, {
    canSubmit: formDirty && radiusNum > 0 && !busy,
    onSubmit: () => void saveRadius(),
  });

  if (!selectIsHydrated(state)) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }
  if (!site) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
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

  const archive = async () => {
    setBusy(true);
    const res = await emit({ type: "ARCHIVE_SITE", siteId: site.id });
    setBusy(false);
    if (res.ok) router.back();
  };

  return (
    <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
      <Stack.Screen options={{ title: site.alias || t("sites.title"), headerRight: () => <HelpButton screen="siteEdit" /> }} />
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
            <Input {...chain.props("radius")} label={t("sites.radius")} value={radiusValue} onChangeText={setRadius} />
            <Input {...chain.props("arrivalDwell")} label={t("sites.arrivalDwell")} value={dwellValue} onChangeText={setDwell} />
            <Text style={{ color: TOKENS.colors.text.secondary }}>{t("sites.arrivalDwellHint")}</Text>
            {formDirty ? <Button label={t("common.save")} size="sm" isLoading={busy} onPress={() => void saveRadius()} /> : null}
          </Card>
        ) : null}

        <Section title={`${t("sites.visits")} (${visits.length})`}>
          {visits.length === 0 ? <Text style={{ color: TOKENS.colors.text.muted }}>{t("common.noData")}</Text> : null}
          {visits.map((c) => (
            <SessionListItem key={c.session.id} item={c} onPress={() => router.push(`/session/${c.session.id}`)} />
          ))}
        </Section>

        {site.active ? <Button label={t("sites.archive")} variant="danger" disabled={busy} onPress={() => void archive()} /> : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
});
