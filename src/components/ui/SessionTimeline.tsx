import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { LedgerEntry } from "../../core/contracts";
import { t } from "../../i18n";
import { formatTime } from "../../utils/dateUtils";
import { useMotionPreference, REDUCED_FADE_MS } from "./motion";

/**
 * SessionTimeline — portado de GEOTrack. Se alimenta de LedgerEntry (Producto
 * §5.9), no de un array hardcodeado de cuatro hitos. `ledgerToTimeline`
 * convierte asientos en nodos; el evento GPS original se conserva aunque haya
 * edición manual posterior.
 */

export type TimelineEvent = {
  id: string;
  title: string;
  time: string;
  subtitle?: string;
  type: "start" | "arrival" | "warning" | "close" | "note";
};

const INTENT_TYPE: Partial<Record<LedgerEntry["intent"], TimelineEvent["type"]>> = {
  START_DAY: "start",
  ARRIVAL_CONFIRMED: "arrival",
  EXIT_DETECTED: "warning",
  CLOSE_DAY: "close",
  AUTO_CLOSE: "warning",
  MANUAL_PATCH: "note",
  ADD_NOTE: "note",
  OS_KILL: "warning",
  INTEGRITY_DEGRADE: "warning",
};

/** Etiqueta humana de un estado de sesión (t("states.X.label")); nunca el enum crudo. */
export function stateLabel(state: string): string {
  const key = `states.${state}.label`;
  const v = t(key);
  return v === key ? "" : v;
}

/**
 * Subtítulo de un asiento: transición "Esperando llegada → En sitio" traducida.
 * Los `reason` del ledger son códigos internos (ACCURACY_GT_RADIUS, OVERLAP…):
 * no se muestran tal cual; solo si existe traducción en ledger.reasons.*.
 */
export function ledgerSubtitle(e: Pick<LedgerEntry, "fromState" | "toState" | "reason">): string | undefined {
  if (e.fromState && e.toState && e.fromState !== e.toState) {
    const from = stateLabel(e.fromState);
    const to = stateLabel(e.toState);
    if (from && to) return `${from} → ${to}`;
  }
  if (e.reason) {
    const key = `ledger.reasons.${e.reason}`;
    const v = t(key);
    if (v !== key) return v;
  }
  return undefined;
}

export function ledgerToTimeline(entries: LedgerEntry[], labelFor: (e: LedgerEntry) => string): TimelineEvent[] {
  return entries.map((e) => ({
    id: String(e.id),
    title: labelFor(e),
    time: formatTime(e.timestampMs),
    subtitle: ledgerSubtitle(e),
    type: INTENT_TYPE[e.intent] ?? (e.integrityClass === "CONFLICT" ? "warning" : "note"),
  }));
}

/** Solo los primeros nodos entran escalonados; el resto aparece sin animación. */
export const TIMELINE_STAGGER_MAX = 6;
const STAGGER_STEP_MS = 100;

/** Animación de entrada del nodo `index` (undefined = sin animación). */
export function timelineEntering(index: number, reduceMotion: boolean) {
  if (index >= TIMELINE_STAGGER_MAX) return undefined;
  if (reduceMotion) return FadeIn.duration(REDUCED_FADE_MS);
  return FadeInDown.delay(STAGGER_STEP_MS + index * STAGGER_STEP_MS).duration(400);
}

interface SessionTimelineProps {
  events: TimelineEvent[];
  title?: string;
  emptyText?: string;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export function SessionTimeline({ events, title, emptyText, inset = false }: SessionTimelineProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const getEventStyle = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "start":
        return { dotColor: colors.primary, hasBorder: false };
      case "arrival":
        return { dotColor: colors.status.success, hasBorder: false };
      case "warning":
        return { dotColor: colors.status.warning, hasBorder: false };
      case "note":
        return { dotColor: colors.status.info, hasBorder: false };
      case "close":
        return { dotColor: colors.surfaceElevated, hasBorder: true };
      default:
        return { dotColor: colors.text.muted, hasBorder: false };
    }
  };

  return (
    <View
      style={[styles.timelineBlock, inset && styles.inset, { backgroundColor: colors.surface }]}
    >
      <Text
        style={[styles.sectionTitle, { color: colors.text.primary }]}
      >
        {title ?? t("session.activityTitle")}
      </Text>

      {events.length === 0 ? (
        <Animated.Text
          entering={reduceMotion ? FadeIn.duration(REDUCED_FADE_MS) : FadeInDown.duration(400)}
          style={[styles.emptyText, { color: colors.text.muted }]}
        >
          {emptyText ?? t("session.activityEmpty")}
        </Animated.Text>
      ) : (
        <View style={styles.timeline}>
          {events.map((event, index) => {
            const { dotColor, hasBorder } = getEventStyle(event.type);
            const isLast = index === events.length - 1;

            return (
              <Animated.View
                key={event.id}
                entering={timelineEntering(index, reduceMotion)}
                style={styles.timelineNode}
              >
                <View
                  style={[
                    styles.nodeDot,
                    { backgroundColor: dotColor },
                    hasBorder && {
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}
                />

                {!isLast && (
                  <View
                    style={[
                      styles.nodeLine,
                      { backgroundColor: colors.border },
                    ]}
                  />
                )}

                <View style={styles.nodeContent}>
                  <Text
                    style={[
                      styles.nodeTitle,
                      { color: colors.text.primary },
                    ]}
                  >
                    {event.title}
                  </Text>
                  <Text
                    style={[
                      styles.nodeTime,
                      { color: colors.text.secondary },
                    ]}
                  >
                    {event.time} {event.subtitle ? `• ${event.subtitle}` : ""}
                  </Text>
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { marginHorizontal: TOKENS.layout.screenPadding },
  timelineBlock: {
    marginHorizontal: 0,
    padding: 18,
    borderRadius: TOKENS.radius.lg,
    marginBottom: TOKENS.spacing.xl,
  },
  sectionTitle: { ...FONT.h3, fontSize: 16, marginBottom: TOKENS.spacing.md },
  emptyText: { ...FONT.body, fontSize: 14, fontStyle: "italic" },
  timeline: { marginTop: TOKENS.spacing.sm },
  timelineNode: {
    flexDirection: "row",
    marginBottom: TOKENS.spacing.lg,
    position: "relative",
  },
  nodeContent: { flex: 1, paddingBottom: 4 },
  nodeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 4,
    marginRight: TOKENS.spacing.md,
    zIndex: 2,
  },
  nodeLine: {
    position: "absolute",
    left: 6,
    top: 16,
    bottom: -20,
    width: 2,
    zIndex: 1,
  },
  nodeTitle: { ...FONT.bodyStrong },
  nodeTime: { ...FONT.caption, marginTop: 2 },
});
