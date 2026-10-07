/**
 * Preferencias de accesibilidad de movimiento y transparencia.
 *  - useMotionPreference(): AccessibilityInfo.isReduceMotionEnabled (lectura
 *    asíncrona inicial + listener "reduceMotionChanged"). Con movimiento
 *    reducido: sin bucles withRepeat, fundidos de 150 ms y sin hápticos.
 *  - useReduceTransparency(): iOS "Reducir transparencia" → sin cristal.
 * Un único listener por preferencia, compartido por todos los componentes.
 */
import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";

type Pref = {
  value: boolean;
  listeners: Set<() => void>;
  started: boolean;
  sub: { remove: () => void } | null;
};

function createPref(read: () => Promise<boolean>, event: "reduceMotionChanged" | "reduceTransparencyChanged") {
  const pref: Pref = { value: false, listeners: new Set(), started: false, sub: null };
  const set = (v: boolean) => {
    if (pref.value === v) return;
    pref.value = v;
    pref.listeners.forEach((l) => l());
  };
  const start = () => {
    if (pref.started) return;
    pref.started = true;
    read()
      .then((v) => set(!!v))
      .catch(() => undefined);
    try {
      pref.sub = AccessibilityInfo.addEventListener(event, (v: boolean) => set(!!v)) ?? null;
    } catch {
      // Plataforma sin el evento (web antigua): se queda con el valor leído.
    }
  };
  return {
    subscribe(l: () => void) {
      start();
      pref.listeners.add(l);
      return () => pref.listeners.delete(l);
    },
    get: () => pref.value,
    /** Solo tests: fija el valor y omite la lectura asíncrona del sistema. */
    __set(v: boolean) {
      pref.started = true;
      set(v);
    },
    __reset() {
      pref.sub?.remove?.();
      pref.sub = null;
      pref.value = false;
      pref.started = false;
      pref.listeners.clear();
    },
  };
}

export const ReduceMotionPref = createPref(
  () => AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false),
  "reduceMotionChanged",
);

export const ReduceTransparencyPref = createPref(
  () => (Platform.OS === "ios" ? AccessibilityInfo.isReduceTransparencyEnabled() : Promise.resolve(false)),
  "reduceTransparencyChanged",
);

/** true si el usuario pidió reducir el movimiento. */
export function useMotionPreference(): boolean {
  return useSyncExternalStore(ReduceMotionPref.subscribe, ReduceMotionPref.get, ReduceMotionPref.get);
}

/** true si el usuario pidió reducir la transparencia (iOS). */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(ReduceTransparencyPref.subscribe, ReduceTransparencyPref.get, ReduceTransparencyPref.get);
}

/** Duración de los fundidos cuando el movimiento está reducido. */
export const REDUCED_FADE_MS = 150;

function safely(fn: () => Promise<unknown> | unknown): void {
  try {
    void Promise.resolve(fn()).catch(() => undefined);
  } catch {
    // Motor háptico no disponible.
  }
}

/**
 * Hápticos protegidos: nunca en web ni con movimiento reducido; los fallos
 * del motor háptico no rompen la pulsación.
 */
export const haptics = {
  impact(style: Haptics.ImpactFeedbackStyle, reduceMotion: boolean): void {
    if (Platform.OS === "web" || reduceMotion) return;
    safely(() => Haptics.impactAsync(style));
  },
  notify(type: Haptics.NotificationFeedbackType, reduceMotion: boolean): void {
    if (Platform.OS === "web" || reduceMotion) return;
    safely(() => Haptics.notificationAsync(type));
  },
};
