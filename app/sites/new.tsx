/**
 * sites/new.tsx — Alta de sitio (Producto §5.11). NUEVO.
 * Dirección (obligatoria), cliente, notas y radio (default de Settings).
 * UPSERT_SITE geocodifica y guarda targetLat/targetLon (SiteRegistry); la
 * preview de coordenadas se muestra al resolver. No activa geocerca ni
 * inicia jornada.
 */
import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SiteRadiusField } from "../../src/components/sites/SiteRadiusField";
import { Button, Card, Input, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { KeyValueRow } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { Site } from "../../src/core/contracts";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { t } from "../../src/i18n";
import { parseSiteRadius } from "../../src/utils/siteRadius";

export default function NewSiteScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [radius, setRadius] = useState(String(state.settings.company.defaultRadiusM));
  const { busy, run } = useBusyAction();
  const [saved, setSaved] = useState<Site | null>(null);

  const radiusM = parseSiteRadius(radius);
  const valid = address.trim().length > 0 && radiusM !== null;
  const canSaveUnlocated = alias.trim().length > 0 && radiusM !== null;
  const onSave = () => {
    if (radiusM === null || saved) return;
    const savedRadius = radiusM;
    return run(async () => {
      const res = await emit({
        type: "UPSERT_SITE",
        site: {
          alias: alias.trim() || address.trim(),
          address: address.trim(),
          clientName: client.trim() || null,
          notes: notes.trim() || null,
          radiusM: savedRadius,
        },
      });
      if (res.ok && res.data) setSaved(res.data as Site);
      return res;
    });
  };
  const onSaveUnlocated = () => {
    if (radiusM === null || saved || !alias.trim()) return;
    const savedRadius = radiusM;
    return run(async () => {
      const res = await emit({
        type: "UPSERT_SITE",
        site: {
          alias: alias.trim(),
          address: "",
          unlocated: true,
          clientName: client.trim() || null,
          notes: notes.trim() || null,
          radiusM: savedRadius,
        },
      });
      if (res.ok && res.data) setSaved(res.data as Site);
      return res;
    });
  };
  const chain = useFormFocusChain(FORM_FIELDS.siteNew, { onSubmit: () => void onSave(), canSubmit: valid && !busy && !saved });

  return (
    <ScreenScroll edges={SAFE_EDGES.stack}>
      <Input {...chain.props("alias")} label={t("sites.alias")} value={alias} onChangeText={setAlias} />
      <Input {...chain.props("address")} label={`${t("sites.address")} *`} value={address} onChangeText={setAddress} />
      <Input {...chain.props("client")} label={t("sites.client")} value={client} onChangeText={setClient} />
      <Input {...chain.props("notes")} label={t("sites.notes")} value={notes} onChangeText={setNotes} multiline />
      <SiteRadiusField {...chain.props("radius")} value={radius} onChangeText={setRadius} />

      <Card style={styles.card}>
        <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("sites.coords")}</Text>
        {saved ? (
          saved.targetLat !== null && saved.targetLon !== null ? (
            <KeyValueRow label={t("sites.latLon")} value={`${saved.targetLat.toFixed(5)}, ${saved.targetLon.toFixed(5)}`} mono />
          ) : (
            <Text style={{ color: TOKENS.colors.status.warning }}>{t("sites.coordsMissing")}</Text>
          )
        ) : (
          <Text style={{ color: TOKENS.colors.text.muted }}>{t("sites.coordsPending")}</Text>
        )}
      </Card>

      {saved ? (
        <Button label={t("common.continue")} onPress={() => router.replace(`/sites/${saved.id}`)} />
      ) : (
        <>
          <Button label={t("sites.saveSite")} disabled={!valid || busy} isLoading={busy} onPress={() => void onSave()} />
          <Button label={t("sites.saveUnlocated")} variant="secondary" disabled={!canSaveUnlocated || busy} onPress={() => void onSaveUnlocated()} />
        </>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, marginVertical: TOKENS.spacing.md },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.xs },
});
