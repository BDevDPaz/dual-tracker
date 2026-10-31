/**
 * Mapa de la jornada en un plano local. No carga teselas, no llama a la red
 * y no envía coordenadas: solo dibuja lo que ya está descifrado en memoria.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";
import { ArrivalMark } from "../brand";
import { FONT, ICON, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { SpatialFact } from "../../core/contracts";
import { t, useLanguage } from "../../i18n";
import { circleSamples, fitLocalPlane, niceScaleMeters, projectEquirectangular, toScreen, type LatLon } from "../../utils/localPlane";

export interface TraceSiteMark {
  id: number;
  lat: number;
  lon: number;
  radiusM: number;
}

type Props = {
  facts: readonly SpatialFact[];
  sites: readonly TraceSiteMark[];
  gaps: readonly { toMs: number; kind: "retention" | "recording" }[];
  /** Alternativa textual del recorrido (puntos, salidas, distancia). */
  summary?: string;
  height?: number;
};

type Marker = { key: string; x: number; y: number; role: "enter" | "exit" | "transfer" };

function hasCoords(f: SpatialFact): f is SpatialFact & { lat: number; lon: number } {
  return typeof f.lat === "number" && typeof f.lon === "number" && Number.isFinite(f.lat) && Number.isFinite(f.lon);
}

export function TracePlane({ facts, sites, gaps, summary, height = 280 }: Props) {
  useLanguage();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const model = useMemo(() => {
    const crumbs = facts.filter((f): f is SpatialFact & { lat: number; lon: number } => f.type === "BREADCRUMB" && hasCoords(f));
    const marks = facts.filter((f): f is SpatialFact & { lat: number; lon: number } => (f.type === "ENTER" || f.type === "EXIT") && hasCoords(f));
    const samples: LatLon[] = [
      ...crumbs.map((f) => ({ lat: f.lat, lon: f.lon })),
      ...marks.map((f) => ({ lat: f.lat, lon: f.lon })),
      ...sites.flatMap((s) => circleSamples({ lat: s.lat, lon: s.lon }, s.radiusM)),
    ];
    if (!width || !samples.length) return null;
    // El pin sobresale hacia arriba (ICON.md) y la flecha del norte ocupa
    // la esquina. El encuadre deja ese hueco para que el punto no se recorte
    // ni quede debajo de la flecha.
    const fit = fitLocalPlane(samples, width, height, {
      top: 36 + 14 + ICON.md + TOKENS.spacing.xs,
      right: 28 + ICON.md,
      bottom: TOKENS.spacing["2xl"] + ICON.sm,
      left: ICON.md + TOKENS.spacing.xs,
    });
    if (!fit) return null;
    const place = (lat: number, lon: number) => toScreen(projectEquirectangular({ lat, lon }, fit.origin), fit);
    const broken = new Set(gaps.map((g) => g.toMs));
    const segments: string[] = [];
    let current: string[] = [];
    crumbs.forEach((f, i) => {
      if (i > 0 && broken.has(f.timestampMs)) {
        if (current.length > 1) segments.push(current.join(" "));
        current = [];
      }
      const p = place(f.lat, f.lon);
      current.push(`${p.x},${p.y}`);
    });
    if (current.length > 1) segments.push(current.join(" "));
    let lastEnterSite: number | null | undefined;
    const markers: Marker[] = [];
    for (const f of marks) {
      const p = place(f.lat, f.lon);
      if (f.type === "EXIT") {
        markers.push({ key: `x-${f.timestampMs}`, x: p.x, y: p.y, role: "exit" });
      } else {
        const role = lastEnterSite !== undefined && f.siteId !== lastEnterSite ? "transfer" : "enter";
        lastEnterSite = f.siteId ?? null;
        markers.push({ key: `e-${f.timestampMs}-${role}`, x: p.x, y: p.y, role });
      }
    }
    const circles = sites.map((s) => {
      const p = place(s.lat, s.lon);
      return { id: s.id, cx: p.x, cy: p.y, r: Math.max(4, s.radiusM * fit.scale) };
    });
    const barM = niceScaleMeters(width, 1 / fit.scale);
    return { segments, markers, circles, barM, barPx: barM * fit.scale };
  }, [facts, sites, gaps, width, height]);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onEnd((e) => {
        setZoom((z) => Math.min(8, Math.max(1, z * (e.scale || 1))));
      });
    const drag = Gesture.Pan()
      .runOnJS(true)
      .onEnd((e) => {
        setPan((p) => ({ x: p.x + e.translationX, y: p.y + e.translationY }));
      });
    return Gesture.Simultaneous(pinch, drag);
  }, []);

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.frame, { height, backgroundColor: colors.surface, borderColor: colors.border }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <GestureDetector gesture={gesture}>
          <View style={[styles.plane, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }]}>
            {model ? (
              <Svg width={width} height={height}>
                {model.circles.map((c) => (
                  <Circle key={c.id} cx={c.cx} cy={c.cy} r={c.r} fill={colors.statusBg.info} stroke={colors.status.info} strokeWidth={1.5} />
                ))}
                {model.segments.map((points, i) => (
                  <Polyline key={i} points={points} fill="none" stroke={colors.goldText} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {model.markers
                  .filter((m) => m.role === "exit")
                  .map((m) => (
                    <Circle key={m.key} cx={m.x} cy={m.y} r={6} fill={colors.surface} stroke={colors.status.warning} strokeWidth={2} />
                  ))}
              </Svg>
            ) : null}
            {model
              ? model.markers
                  .filter((m) => m.role !== "exit")
                  .map((m) => (
                    <View key={m.key} style={[styles.mark, { left: m.x - ICON.md / 2, top: m.y - ICON.md }]} pointerEvents="none">
                      <ArrivalMark size={ICON.md} color={m.role === "transfer" ? colors.status.info : colors.goldText} decorative />
                    </View>
                  ))
              : null}
          </View>
        </GestureDetector>
        <View style={styles.chrome} pointerEvents="none">
          <View style={styles.north} accessibilityLabel={t("trace.north")}>
            <Svg width={28} height={36}>
              <Path d="M14 2 L20 22 L14 18 L8 22 Z" fill={colors.text.primary} />
              <Line x1={14} y1={18} x2={14} y2={34} stroke={colors.text.secondary} strokeWidth={2} />
            </Svg>
            <Text style={[styles.northLetter, { color: colors.text.primary }]}>{t("trace.northLetter")}</Text>
          </View>
          {model ? (
            <View style={styles.barWrap}>
              <View style={[styles.bar, { width: Math.min(model.barPx, width * 0.4), backgroundColor: colors.text.primary }]} />
              <Text style={[styles.barLabel, { color: colors.text.secondary }]}>{t("trace.meters", { n: model.barM })}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={[styles.summary, { color: colors.text.secondary }]}>{summary ?? t("trace.mapLabel")}</Text>
      <View style={styles.zoom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("trace.zoomIn")}
          accessibilityState={{ disabled: zoom >= 8 }}
          disabled={zoom >= 8}
          onPress={() => setZoom((z) => Math.min(8, z * 1.4))}
          style={[styles.zoomBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        >
          <Ionicons name="add" size={ICON.lg} color={zoom >= 8 ? colors.text.muted : colors.text.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("trace.zoomOut")}
          accessibilityState={{ disabled: zoom <= 1 }}
          disabled={zoom <= 1}
          onPress={() => setZoom((z) => Math.max(1, z / 1.4))}
          style={[styles.zoomBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        >
          <Ionicons name="remove" size={ICON.lg} color={zoom <= 1 ? colors.text.muted : colors.text.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("trace.zoomReset")} onPress={reset} style={[styles.zoomBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Ionicons name="scan-outline" size={ICON.lg} color={colors.text.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: TOKENS.spacing.md },
  frame: { borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.lg, overflow: "hidden" },
  plane: { flex: 1 },
  mark: { position: "absolute" },
  chrome: { position: "absolute", top: TOKENS.spacing.sm, right: TOKENS.spacing.sm, left: TOKENS.spacing.sm, bottom: TOKENS.spacing.sm, justifyContent: "space-between" },
  north: { alignSelf: "flex-end", alignItems: "center" },
  northLetter: { ...FONT.caption },
  barWrap: { alignSelf: "flex-start" },
  bar: { height: TOKENS.layout.focusOutline, borderRadius: TOKENS.layout.hairline },
  barLabel: { ...FONT.caption, marginTop: TOKENS.spacing.xxs },
  summary: { ...FONT.caption, marginTop: TOKENS.spacing.sm },
  zoom: { flexDirection: "row", gap: TOKENS.spacing.xs, marginTop: TOKENS.spacing.sm },
  zoomBtn: {
    minWidth: TOKENS.layout.minTouchTarget,
    minHeight: TOKENS.layout.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TOKENS.radius.md,
    borderWidth: TOKENS.layout.hairline,
  },
});
