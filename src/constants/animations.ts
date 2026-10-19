import {
  Easing,
  WithSpringConfig,
  FadeInDown,
  FadeIn,
  SlideInDown,
  Layout,
} from "react-native-reanimated";

/**
 * DURACIONES Y EASINGS - Sistema de animaciones endurecido
 */

export const DURATIONS = {
  /** Movimiento reducido: fundido corto, sin deslizamientos. */
  reduced: 150,
  fast: 200,
  /** Transiciones de pantalla y hoja: 200–250 ms. */
  transition: 220,
  normal: 240,
  slow: 500,
  toast: 3500,
  toastTransition: 240,
};

export const EASINGS = {
  standard: Easing.out(Easing.exp),
  decelerate: Easing.out(Easing.quad),
  accelerate: Easing.in(Easing.quad),
  emphasized: Easing.bezier(0.4, 0.0, 0.2, 1.0),
};

/**
 * Devuelve la configuración global de resortes.
 */
export const getSpringConfig = (): WithSpringConfig => ({
  damping: 20,
  stiffness: 90,
  mass: 1,
  overshootClamping: false,
});

/**
 * PRESETS REUTILIZABLES
 */
export const ANIM_PRESETS = {
  // Transición para modales
  modalEnter: SlideInDown.duration(DURATIONS.transition).easing(EASINGS.emphasized),

  // Transición para entradas de pantalla
  screenEntry: FadeInDown.duration(DURATIONS.transition).easing(EASINGS.decelerate),

  // Transición para elementos de lista
  listItem: FadeInDown.duration(DURATIONS.fast).easing(EASINGS.standard),

  // Fondo del modal (Modal usa animationType="none"; la animación es solo esta)
  overlayEnter: FadeIn.duration(DURATIONS.fast),

  // Movimiento reducido: fundido corto de 150 ms en lugar de deslizamientos/resortes
  reducedFade: FadeIn.duration(DURATIONS.reduced),

  // Transición de layout automática
  layout: Layout.duration(DURATIONS.transition),
};

/**
 * VALORES DE INTERACCIÓN
 */
export const INTERACTION = {
  pressedScale: 0.96,
  disabledOpacity: 0.5,
  activeOpacity: 1,
};
