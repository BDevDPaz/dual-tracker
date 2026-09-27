import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { Site, SiteDraft } from "../../core/contracts";
import { t } from "../../i18n";

/**
 * DailySetupModal — portado de GEOTrack/LEDTracker (Producto §5.11 y §7).
 * La dirección deja de ser un string efímero: el modal ofrece un PICKER de
 * sitios existentes (SiteRegistry) además del ALTA RÁPIDA. Devuelve siempre
 * un siteId. Modos: "start" (NO_INICIADA) y "transit" (iniciar traslado).
 * La geocodificación y el límite de destinos los aplica SiteRegistry, no el modal.
 */
interface DailySetupModalProps {
  visible: boolean;
  mode: "start" | "transit";
  sites: Site[];
  excludeSiteId?: number | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (siteId: number) => void;
  /** Alta rápida: la pantalla emite UPSERT_SITE y devuelve el sitio creado. */
  onQuickCreate: (draft: SiteDraft) => Promise<Site | null>;
}

export function DailySetupModal({ visible, mode, sites, excludeSiteId = null, busy = false, onCancel, onConfirm, onQuickCreate }: DailySetupModalProps) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [quick, setQuick] = useState(false);
  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      setQuick(sites.length === 0);
      setAlias("");
      setAddress("");
      setClient("");
    }
  }, [visible, sites.length]);

  const options = sites.filter((s) => s.id !== excludeSiteId);

  const confirm = async () => {
    if (!quick) {
      if (selected !== null) onConfirm(selected);
      return;
    }
    setCreating(true);
    const site = await onQuickCreate({ alias: alias.trim() || address.trim(), address, clientName: client || null });
    setCreating(false);
    if (site) onConfirm(site.id);
  };

  const canConfirm = quick ? address.trim().length > 0 : selected !== null;

  return (
    <ModalShell
      visible={visible}
      title={t(mode === "start" ? "modals.dailySetupStartTitle" : "modals.dailySetupTransitTitle")}
      description={t(mode === "start" ? "modals.dailySetupStartSub" : "modals.dailySetupTransitSub")}
      onClose={onCancel}
      icon={ICONS.domain.location}
      scrollable
      primaryAction={{
        label: t(mode === "start" ? "modals.activateGeofence" : "modals.startTransit"),
        onPress: () => {
          confirm().catch(() => setCreating(false));
        },
        disabled: !canConfirm,
        loading: busy || creating,
      }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    >
      <View style={styles.tabs}>
        {(["pick", "quick"] as const).map((k) => {
          const active = (k === "quick") === quick;
          return (
            <Pressable key={k} onPress={() => setQuick(k === "quick")} style={[styles.tab, { borderColor: active ? colors.primary : colors.border }]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.text.secondary }]}>
                {t(k === "pick" ? "modals.pickSite" : "modals.quickCreate")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!quick ? (
        <View style={styles.list}>
          {options.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSelected(s.id)}
              style={[styles.siteRow, { backgroundColor: colors.surface, borderColor: selected === s.id ? colors.primary : colors.border }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === s.id }}
            >
              <Text style={[styles.siteAlias, { color: colors.text.primary }]}>{s.alias}</Text>
              <Text style={[styles.siteAddr, { color: colors.text.secondary }]} numberOfLines={1}>
                {s.clientName ? `${s.clientName} · ` : ""}
                {s.address}
              </Text>
            </Pressable>
          ))}
          {options.length === 0 ? <Text style={[styles.siteAddr, { color: colors.text.muted }]}>{t("sites.empty")}</Text> : null}
        </View>
      ) : (
        <View>
          <Input label={t("sites.address")} icon="map-outline" value={address} onChangeText={setAddress} autoFocus />
          <Input label={t("sites.alias")} icon={ICONS.domain.location} value={alias} onChangeText={setAlias} />
          <Input label={t("sites.client")} icon="business-outline" value={client} onChangeText={setClient} />
        </View>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  tab: { flex: 1, paddingVertical: TOKENS.spacing.sm, borderWidth: 1, borderRadius: TOKENS.radius.md, alignItems: "center" },
  tabText: { ...FONT.label },
  list: { gap: TOKENS.spacing.sm },
  siteRow: { borderWidth: 1, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.md },
  siteAlias: { ...FONT.bodyStrong },
  siteAddr: { ...FONT.caption, marginTop: 2 },
});
