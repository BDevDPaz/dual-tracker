/**
 * sites/[id].tsx — Ficha de sitio (Producto §5.11). NUEVO.
 * Datos del destino, editar radio, visitas a ese siteId y archivar.
 * Archivar no borra historial. Intenciones: UPSERT_SITE, ARCHIVE_SITE.
 */
import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ConfirmActionModal } from "../../src/components/modals";
import { SiteRadiusField } from "../../src/components/sites/SiteRadiusField";
import { Button, Card, NotFoundState, SAFE_EDGES, ScreenContainer, ScreenScroll, Section } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { HelpButton } from "../../src/components/support/HelpButton";
import { KeyValueRow, ScreenStatusBanner, SessionListItem } from "../../src/components/blocks";
import { TOKENS } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useAutoRefresh, useBusyAction, useClock, usePullToRefresh, useWorkTracker } from "../../src/core/hooks";
import { selectComputedSessions, selectIsAdminUnlocked, selectIsHydrated, selectSiteById, selectSiteLastVisitAtMs, selectVisibleSessions, sessionVisitsSite } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDate } from "../../src/utils/dateUtils";
import { readTwoPositions } from "../../src/utils/locateReadings";
import { parseSiteRadius } from "../../src/utils/siteRadius";

export default function SiteDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  const { state, emit } = useWorkTracker();
  const nowMs = useClock(60_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const site = Number.isFinite(siteId) ? selectSiteById(state, siteId) : null;
  const unlocked = selectIsAdminUnlocked(state, nowMs);
  const [radius, setRadius] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmMove, setConfirmMove] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const { busy, run } = useBusyAction();
  const storedRadius = site?.radiusM ?? state.settings.company.defaultRadiusM;
  const radiusValue = radius ?? String(storedRadius);
  const radiusM = parseSiteRadius(radiusValue);
  const radiusDirty = site != null && radius !== null && radiusM !== storedRadius;

  const saveRadius = () => {
    if (!site || radiusM === null) return;
    const savedRadius = radiusM;
    return run(async () => {
      const res = await emit({
        type: "UPSERT_SITE",
        site: {
          id: site.id,
          alias: site.alias,
          address: site.address,
          clientName: site.clientName,
          notes: site.notes,
          radiusM: savedRadius,
        },
      });
      if (res.ok) setRadius(null);
      return res;
    });
  };
  const chain = useFormFocusChain(FORM_FIELDS.siteRadius, {
    canSubmit: radiusDirty && radiusM !== null && !busy,
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
        <NotFoundState title={t("sites.notFound")} onBack={() => (router.canGoBack() ? router.back() : router.replace("/sites"))} />
      </ScreenContainer>
    );
  }

  const visits = selectComputedSessions(
    state,
    nowMs,
    selectVisibleSessions(state).filter((s) => sessionVisitsSite(s, site.id)),
  );
  const lastVisit = selectSiteLastVisitAtMs(state, site.id);

  const hasPoint = site.targetLat !== null && site.targetLon !== null;
  const locate = () =>
    run(async () => {
      setLocateError(false);
      const readings = await readTwoPositions();
      if (!readings) {
        setLocateError(true);
        return { ok: false as const, code: "INVALID_POINT" };
      }
      const res = await emit({ type: "LOCATE_SITE", siteId: site.id, readings });
      if (res.ok) setConfirmMove(false);
      else setLocateError(true);
      return res;
    });

  const archive = () =>
    run(async () => {
      const res = await emit({ type: "ARCHIVE_SITE", siteId: site.id });
      if (res.ok) router.back();
      return res;
    });

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
          {site.active ? (
            <Button
              label={hasPoint ? t("sites.locateConfirm") : t("sites.locateHere")}
              size="sm"
              disabled={busy}
              onPress={() => (hasPoint ? setConfirmMove(true) : void locate())}
            />
          ) : null}
          {locateError ? <Text style={{ color: colors.status.warning }}>{t("sites.locateFailed")}</Text> : null}
        </Card>

        {site.active ? (
          <Card style={styles.card}>
            {unlocked ? (
              <>
                <SiteRadiusField {...chain.props("radius")} value={radiusValue} onChangeText={setRadius} />
                {radiusDirty ? (
                  <Button label={t("common.save")} size="sm" disabled={radiusM === null || busy} isLoading={busy} onPress={() => void saveRadius()} />
                ) : null}
              </>
            ) : (
              <>
                <KeyValueRow label={t("sites.radius")} value={`${storedRadius} m`} />
                <Text style={{ color: colors.text.secondary }}>{t("notifications.thresholdsLocked")}</Text>
              </>
            )}
          </Card>
        ) : null}

        <Section title={`${t("sites.visits")} (${visits.length})`}>
          {visits.length === 0 ? <Text style={{ color: colors.text.muted }}>{t("common.noData")}</Text> : null}
          {visits.map((c) => (
            <SessionListItem key={c.session.id} item={c} onPress={() => router.push(`/session/${c.session.id}`)} />
          ))}
        </Section>

        {site.active ? <Button label={t("sites.archive")} variant="danger" disabled={busy} onPress={() => setConfirmArchive(true)} /> : null}
        <ConfirmActionModal
          visible={confirmMove}
          title={t("sites.moveTitle")}
          description={t("sites.moveBody")}
          confirmLabel={t("sites.locateConfirm")}
          busy={busy}
          onCancel={() => setConfirmMove(false)}
          onConfirm={() => void locate()}
        />
        <ConfirmActionModal
          visible={confirmArchive}
          title={t("sites.archiveTitle")}
          description={t("sites.archiveBody")}
          confirmLabel={t("sites.archive")}
          busy={busy}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => void archive()}
        />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
});
