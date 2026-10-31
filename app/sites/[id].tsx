import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, FlatList, Alert, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";

import dayjs from "../../src/utils/dayjsSetup";
import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useLanguage } from "../../src/context/LanguageContext";
import {
  ScreenContainer,
  PageHeader,
  Card,
  Input,
  Button,
  StatusPill,
  IntegrityBadge,
  EmptyState,
  LoadingOverlay,
  Section,
} from "../../src/components/ui";
import { useSiteDetail, toIntegrityBadgeType } from "../../src/core/hooks/dualTracker";
import type { SessionRecord } from "../../src/core/contracts/domain";

function formatVisitHours(session: SessionRecord): string {
  if (session.actualStartAtMs === null || session.endAtMs === null) return "—";
  const netMs = Math.max(0, session.endAtMs - session.actualStartAtMs - session.totalPausedMs);
  const totalMinutes = Math.round(netMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function VisitRow({ session, onPress }: { session: SessionRecord; onPress: () => void }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.visitCard}>
        <View style={styles.visitRow}>
          <View>
            <Text style={styles.visitDate}>
              {session.dateString ?? dayjs(session.declaredStartAtMs).format("DD MMM YYYY")}
            </Text>
            <Text style={styles.visitHours}>{formatVisitHours(session)}</Text>
          </View>
          <IntegrityBadge type={toIntegrityBadgeType(session.integrityClass)} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function SiteDetailScreen() {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const siteId = id ?? null;

  const { loading, error, site, visits, archive, reactivate, updateRadius } = useSiteDetail(siteId);

  const [radiusText, setRadiusText] = useState("");
  const [savingRadius, setSavingRadius] = useState(false);
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (site) {
      setRadiusText(String(site.radiusMeters));
    }
  }, [site]);

  const handleSaveRadius = async () => {
    const parsed = Number(radiusText);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRadiusError(t("site_radius_error"));
      return;
    }
    setRadiusError(null);
    setSavingRadius(true);
    try {
      await updateRadius(parsed);
    } catch (err) {
      setRadiusError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRadius(false);
    }
  };

  const handleArchive = () => {
    Alert.alert(
      t("site_archive_title"),
      t("site_archive_desc"),
      [
        { text: t("session_cancel"), style: "cancel" },
        {
          text: t("site_archive_confirm"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await archive();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      await reactivate();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <PageHeader title={t("site_detail_title")} showBack />
        <LoadingOverlay visible message={t("site_loading")} />
      </ScreenContainer>
    );
  }

  if (!loading && !error && !site) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <PageHeader title={t("site_detail_title")} showBack />
        <EmptyState
          title={t("site_not_found")}
          description={t("site_not_found_desc")}
          icon="location-outline"
        />
      </ScreenContainer>
    );
  }

  if (error && !site) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <PageHeader title={t("site_detail_title")} showBack />
        <EmptyState
          title={t("site_load_error")}
          description={error}
          icon="alert-circle-outline"
        />
      </ScreenContainer>
    );
  }

  if (!site) return null;

  return (
    <ScreenContainer noPadding>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader title={t("site_detail_title")} showBack />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Text style={styles.alias}>{site.alias}</Text>
            <StatusPill
              status={site.isActive ? "info" : "pending"}
              label={site.isActive ? t("sites_active") : t("sites_archived")}
            />
          </View>
          {site.clientName ? <Text style={styles.client}>{site.clientName}</Text> : null}
          <Text style={styles.address}>{site.address || t("sites_no_address")}</Text>
          <Text style={styles.coords}>
            {site.targetLatitude.toFixed(5)}, {site.targetLongitude.toFixed(5)}
          </Text>
        </Card>

        <Section title={t("site_radius_section")}>
          <Card>
            <Input
              label={t("site_radius_label")}
              value={radiusText}
              onChangeText={setRadiusText}
              keyboardType="numeric"
              error={radiusError ?? undefined}
            />
            <Button
              label={t("site_radius_save")}
              variant="primary"
              onPress={handleSaveRadius}
              isLoading={savingRadius}
              disabled={savingRadius || radiusText.trim().length === 0}
            />
          </Card>
        </Section>

        <Section title={t("site_visits")}>
          {visits.length === 0 ? (
            <EmptyState title={t("site_no_visits")} icon="time-outline" />
          ) : (
            <FlatList
              data={visits}
              keyExtractor={(session) => String(session.id)}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <VisitRow session={item} onPress={() => router.push(`/session/${item.id}`)} />
              )}
            />
          )}
        </Section>

        <View style={styles.actions}>
          {site.isActive ? (
            <Button
              label={t("site_archive")}
              variant="danger"
              onPress={handleArchive}
              isLoading={busy}
              disabled={busy}
            />
          ) : (
            <Button
              label={t("site_reactivate")}
              variant="success"
              onPress={handleReactivate}
              isLoading={busy}
              disabled={busy}
            />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  scrollContent: {
    paddingBottom: tokens.spacing["4xl"],
  },
  headerCard: {
    marginHorizontal: tokens.layout.screenPadding,
    marginBottom: tokens.spacing.lg,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  alias: { ...FONT.h2, color: tokens.colors.text.primary },
  client: { ...FONT.body, color: tokens.colors.text.secondary, marginTop: tokens.spacing.xs },
  address: { ...FONT.caption, color: tokens.colors.text.secondary, marginTop: tokens.spacing.sm },
  coords: { ...FONT.caption, color: tokens.colors.text.muted, marginTop: 2 },
  visitCard: { marginBottom: tokens.spacing.sm },
  visitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  visitDate: { ...FONT.bodyStrong, color: tokens.colors.text.primary },
  visitHours: { ...FONT.caption, color: tokens.colors.text.secondary, marginTop: 2 },
  actions: {
    paddingHorizontal: tokens.layout.screenPadding,
    marginTop: tokens.spacing.lg,
  },
  });
}
