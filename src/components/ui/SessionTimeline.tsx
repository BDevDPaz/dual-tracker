import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { TOKENS, FONT } from "../../constants/theme";
import type { LedgerEntry } from "../../core/contracts";
import { t } from "../../i18n";
import { formatTime } from "../../utils/dateUtils";

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

export function ledgerToTimeline(entries: LedgerEntry[], labelFor: (e: LedgerEntry) => string): TimelineEvent[] {
  return entries.map((e) => ({
    id: String(e.id),
    title: labelFor(e),
    time: formatTime(e.timestampMs),
    subtitle: e.fromState && e.toState && e.fromState !== e.toState ? `${e.fromState} → ${e.toState}` : e.reason,
    type: INTENT_TYPE[e.intent] ?? (e.integrityClass === "CONFLICT" ? "warning" : "note"),
  }));
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
  const getEventStyle = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "start":
        return { dotColor: TOKENS.colors.primary, hasBorder: false };
      case "arrival":
        return { dotColor: TOKENS.colors.status.success, hasBorder: false };
      case "warning":
        return { dotColor: TOKENS.colors.status.warning, hasBorder: false };
      case "note":
        return { dotColor: TOKENS.colors.status.info, hasBorder: false };
      case "close":
        return { dotColor: TOKENS.colors.surfaceElevated, hasBorder: true };
      default:
        return { dotColor: TOKENS.colors.text.muted, hasBorder: false };
    }
  };

  return (
    <View
      style={[styles.timelineBlock, inset && styles.inset, { backgroundColor: TOKENS.colors.surface }]}
    >
      <Text
        style={[styles.sectionTitle, { color: TOKENS.colors.text.primary }]}
      >
        {title ?? t("session.activityTitle")}
      </Text>

      {events.length === 0 ? (
        <Animated.Text
          entering={FadeInDown.duration(400)}
          style={[styles.emptyText, { color: TOKENS.colors.text.muted }]}
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
                entering={FadeInDown.delay(100 + index * 100).duration(400)}
                style={styles.timelineNode}
              >
                <View
                  style={[
                    styles.nodeDot,
                    { backgroundColor: dotColor },
                    hasBorder && {
                      borderWidth: 1,
                      borderColor: TOKENS.colors.border,
                    },
                  ]}
                />

                {!isLast && (
                  <View
                    style={[
                      styles.nodeLine,
                      { backgroundColor: TOKENS.colors.border },
                    ]}
                  />
                )}

                <View style={styles.nodeContent}>
                  <Text
                    style={[
                      styles.nodeTitle,
                      { color: TOKENS.colors.text.primary },
                    ]}
                  >
                    {event.title}
                  </Text>
                  <Text
                    style={[
                      styles.nodeTime,
                      { color: TOKENS.colors.text.secondary },
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
