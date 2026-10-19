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
import { Button, Card, Input, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { KeyValueRow } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { Site } from "../../src/core/contracts";
import { useWorkTracker } from "../../src/core/hooks";
import { t } from "../../src/i18n";

export default function NewSiteScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [radius, setRadius] = useState(String(state.settings.company.defaultRadiusM));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Site | null>(null);

  const radiusNum = Math.round(Number(radius));
  const valid = address.trim().length > 0 && radiusNum > 0;
  const onSave = async () => {
    setBusy(true);
    const res = await emit({
      type: "UPSERT_SITE",
      site: {
        alias: alias.trim() || address.trim(),
        address: address.trim(),
        clientName: client.trim() || null,
        notes: notes.trim() || null,
        radiusM: radiusNum,
      },
    });
    setBusy(false);
    if (res.ok && res.data) setSaved(res.data as Site);
  };
  const chain = useFormFocusChain(FORM_FIELDS.siteNew, { onSubmit: () => void onSave(), canSubmit: valid && !busy && !saved });

  return (
    <ScreenScroll edges={SAFE_EDGES.stack}>
      <Input {...chain.props("alias")} label={t("sites.alias")} value={alias} onChangeText={setAlias} />
      <Input {...chain.props("address")} label={`${t("sites.address")} *`} value={address} onChangeText={setAddress} />
      <Input {...chain.props("client")} label={t("sites.client")} value={client} onChangeText={setClient} />
      <Input {...chain.props("notes")} label={t("sites.notes")} value={notes} onChangeText={setNotes} multiline />
      <Input {...chain.props("radius")} label={t("sites.radius")} value={radius} onChangeText={setRadius} />

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
        <Button label={t("sites.saveSite")} disabled={!valid} isLoading={busy} onPress={() => void onSave()} />
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, marginVertical: TOKENS.spacing.md },
  label: { ...FONT.label, marginBottom: TOKENS.spacing.xs },
});
