import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

export type TimelineEvent = {
  id: string;
  title: string;
  time: string;
  subtitle?: string;
  type: "start" | "arrival" | "warning" | "close" | "note";
};

interface SessionTimelineProps {
  events: TimelineEvent[];
}

export function SessionTimeline({ events }: SessionTimelineProps) {
  const { tokens } = useTheme();

  const getEventStyle = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "start":
        return { dotColor: tokens.colors.primary, hasBorder: false };
      case "arrival":
        return { dotColor: tokens.colors.status.success, hasBorder: false };
      case "warning":
        return { dotColor: tokens.colors.status.warning, hasBorder: false };
      case "note":
        return { dotColor: tokens.colors.status.info, hasBorder: false };
      case "close":
        return { dotColor: tokens.colors.surfaceElevated, hasBorder: true };
      default:
        return { dotColor: tokens.colors.text.muted, hasBorder: false };
    }
  };

  return (
    <View
      style={[
        styles.timelineBlock,
        {
          backgroundColor: tokens.colors.surface,
          marginHorizontal: tokens.layout.screenPadding,
          borderRadius: tokens.radius.lg,
          marginBottom: tokens.spacing.xl,
        },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: tokens.colors.text.primary }]}>
        Actividad de la jornada
      </Text>

      {events.length === 0 ? (
        <Animated.Text
          entering={FadeInDown.duration(400)}
          style={[styles.emptyText, { color: tokens.colors.text.muted }]}
        >
          Aún no hay actividad.
        </Animated.Text>
      ) : (
        <View style={[styles.timeline, { marginTop: tokens.spacing.sm }]}>
          {events.map((event, index) => {
            const { dotColor, hasBorder } = getEventStyle(event.type);
            const isLast = index === events.length - 1;

            return (
              <Animated.View
                key={event.id}
                entering={FadeInDown.delay(100 + index * 100).duration(400)}
                style={[styles.timelineNode, { marginBottom: tokens.spacing.lg }]}
              >
                <View
                  style={[
                    styles.nodeDot,
                    { backgroundColor: dotColor, marginRight: tokens.spacing.md },
                    hasBorder && {
                      borderWidth: 1,
                      borderColor: tokens.colors.border,
                    },
                  ]}
                />

                {!isLast && (
                  <View style={[styles.nodeLine, { backgroundColor: tokens.colors.border }]} />
                )}

                <View style={styles.nodeContent}>
                  <Text style={[styles.nodeTitle, { color: tokens.colors.text.primary }]}>
                    {event.title}
                  </Text>
                  <Text style={[styles.nodeTime, { color: tokens.colors.text.secondary }]}>
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
  timelineBlock: {
    padding: 18,
  },
  sectionTitle: { ...FONT.h3, fontSize: 16, marginBottom: 12 },
  emptyText: { ...FONT.body, fontSize: 14, fontStyle: "italic" },
  timeline: {},
  timelineNode: {
    flexDirection: "row",
    position: "relative",
  },
  nodeContent: { flex: 1, paddingBottom: 4 },
  nodeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 4,
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
