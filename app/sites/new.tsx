import React, { useState, useMemo } from "react";
import { Text, StyleSheet, ScrollView } from "react-native";
import { useRouter, Stack } from "expo-router";
// Excepción sancionada (igual que app/(onboarding)/permissions.tsx): esta es
// la ÚNICA pantalla de app/ que puede importar expo-location, porque
// Location.geocodeAsync es la única forma de resolver una dirección escrita
// a coordenadas sin depender de una API de mapas de terceros que no está
// instalada en este proyecto (no hay react-native-maps ni clave de Google
// Maps configurada). No se usa ningún otro servicio de ubicación aquí: no
// hay watch, no hay permisos de background, solo un geocode puntual bajo
// demanda al presionar "Buscar coordenadas".
import * as Location from "expo-location";

import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useLanguage } from "../../src/context/LanguageContext";
import { ScreenContainer, PageHeader, Card, Input, Button } from "../../src/components/ui";
import { useSiteRegistry } from "../../src/core/hooks/dualTracker";
import { useWorkTracker } from "../../src/core/hooks/useWorkTracker";

export default function NewSiteScreen() {
  const { tokens } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();
  const { createSite } = useSiteRegistry();
  const { state } = useWorkTracker();

  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [clientName, setClientName] = useState("");
  const [radiusText, setRadiusText] = useState(
    String(state.domain.settings.toleranceRadiusMeters ?? 100),
  );

  const [geocoding, setGeocoding] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const radiusMeters = Number(radiusText);
  const canSave =
    address.trim().length > 0 &&
    alias.trim().length > 0 &&
    coords !== null &&
    Number.isFinite(radiusMeters) &&
    radiusMeters > 0 &&
    !saving;

  const handleGeocode = async () => {
    if (address.trim().length === 0) return;
    setGeocoding(true);
    setGeocodeMessage(null);
    try {
      const results = await Location.geocodeAsync(address.trim());
      if (results.length === 0) {
        setCoords(null);
        setGeocodeMessage(t("site_geocode_not_found"));
      } else {
        const [first] = results;
        setCoords({ latitude: first.latitude, longitude: first.longitude });
        setGeocodeMessage(
          t("site_coords_found", { lat: first.latitude.toFixed(5), lon: first.longitude.toFixed(5) }),
        );
      }
    } catch (err) {
      setCoords(null);
      setGeocodeMessage(
        err instanceof Error
          ? t("site_geocode_failed", { error: err.message })
          : t("site_geocode_failed_generic"),
      );
    } finally {
      setGeocoding(false);
    }
  };

  const handleSave = async () => {
    if (!canSave || coords === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createSite({
        alias: alias.trim(),
        clientId: null,
        clientName: clientName.trim().length > 0 ? clientName.trim() : null,
        address: address.trim(),
        targetLatitude: coords.latitude,
        targetLongitude: coords.longitude,
        radiusMeters,
      });
      router.back();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer noPadding>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader title={t("site_new_title")} showBack />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card>
          <Input
            label={t("site_alias_label")}
            placeholder={t("site_alias_placeholder")}
            value={alias}
            onChangeText={setAlias}
          />
          <Input
            label={t("site_address_label")}
            placeholder={t("site_address_placeholder")}
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setCoords(null);
              setGeocodeMessage(null);
            }}
            multiline
          />
          <Input
            label={t("site_client_label")}
            placeholder={t("site_client_placeholder")}
            value={clientName}
            onChangeText={setClientName}
          />
          {/*
            CreateSiteInput (src/services/SiteRegistryService.ts) NO tiene un
            campo `notes`: solo alias, clientId, clientName, address,
            targetLatitude/Longitude y radiusMeters. El blueprint §5.11 menciona
            "notas" como campo del alta, pero el contrato congelado no lo
            soporta -- se omite el input de notas en vez de inventar un campo
            que el servicio ignoraría en silencio (regla §4/14 de
            app-layer-conventions.md: nunca fabricar una llamada a un método
            de servicio que no exista).
          */}
          <Input
            label={t("site_radius_label")}
            placeholder="100"
            value={radiusText}
            onChangeText={setRadiusText}
            keyboardType="numeric"
          />

          <Button
            label={geocoding ? t("site_geocode_searching") : t("site_geocode_search")}
            variant="secondary"
            onPress={handleGeocode}
            isLoading={geocoding}
            disabled={address.trim().length === 0 || geocoding}
            style={styles.geocodeButton}
          />

          {geocodeMessage ? <Text style={styles.geocodeMessage}>{geocodeMessage}</Text> : null}

          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

          <Button
            label={t("site_save")}
            variant="primary"
            onPress={handleSave}
            isLoading={saving}
            disabled={!canSave}
            style={styles.saveButton}
          />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  scrollContent: {
    paddingHorizontal: tokens.layout.screenPadding,
    paddingBottom: tokens.spacing["4xl"],
  },
  geocodeButton: { marginTop: tokens.spacing.sm },
  geocodeMessage: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
    marginTop: tokens.spacing.sm,
  },
  errorText: {
    ...FONT.caption,
    color: tokens.colors.status.danger,
    marginTop: tokens.spacing.sm,
  },
  saveButton: { marginTop: tokens.spacing.lg },
  });
}
