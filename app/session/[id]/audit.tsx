/**
 * session/[id]/audit.tsx — Auditoría de la jornada (PR3). Solo lee.
 * Entradas: detalle de la sesión («Ver auditoría») y la sección «Auditoría de
 * jornadas» de la vista previa del periodo (/report/[periodId]).
 * Datos: queries.sessionAudit (ledger, huecos, sello) → selectSessionAudit.
 */
import { useMemo } from "react";
import { Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { NotFoundState, SAFE_EDGES, ScreenContainer, ScreenScroll } from "../../../src/components/ui";
import { ScreenStatusBanner, SessionAuditView } from "../../../src/components/blocks";
import { FONT } from "../../../src/constants/theme";
import { useTheme } from "../../../src/context/ThemeContext";
import { useAutoRefresh, usePullToRefresh, useQuery, useWorkTracker } from "../../../src/core/hooks";
import { selectIsHydrated, selectLedgerHealth, selectSessionAudit, selectSessionById } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";

export default function SessionAuditScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const { state, queries } = useWorkTracker();
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const session = Number.isFinite(sessionId) ? selectSessionById(state, sessionId) : null;
  const updatedAt = session?.bookkeeping.updatedAtMs ?? 0;
  const inputs = useQuery(() => (session ? queries.sessionAudit(session) : Promise.resolve(null)), [sessionId, updatedAt], ["ledger", "trace", "packs"]);
  const incident = selectLedgerHealth(state).broken;
  const audit = useMemo(
    () => (session && inputs.data ? selectSessionAudit(session, inputs.data, { chainIncident: incident }) : null),
    [session, inputs.data, incident],
  );

  if (!selectIsHydrated(state) || (session && inputs.loading && !inputs.data)) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="loading" message={t("common.loading")} />
      </ScreenContainer>
    );
  }
  if (!session) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <NotFoundState title={t("session.notFound")} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/history"))} />
      </ScreenContainer>
    );
  }
  if (!audit) {
    return (
      <ScreenContainer edges={SAFE_EDGES.stack}>
        <ScreenStatusBanner status="empty" message={inputs.error ? t("common.loadError") : t("common.noData")} />
      </ScreenContainer>
    );
  }
  return (
    <ScreenScroll edges={SAFE_EDGES.stack} refreshControl={refreshControl}>
      <Text style={[styles.caption, { color: colors.text.secondary }]}>{session.bookkeeping.dateString}</Text>
      <SessionAuditView audit={audit} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  caption: { ...FONT.caption },
});
