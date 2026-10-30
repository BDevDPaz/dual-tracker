import { Easing, WithSpringConfig, FadeInDown, SlideInDown, Layout } from "react-native-reanimated";

/**
 * DURACIONES Y EASINGS - Sistema de animaciones endurecido
 */

export const DURATIONS = {
  fast: 150,
  normal: 300,
  slow: 500,
  toast: 3500,
  toastTransition: 250,
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
  modalEnter: SlideInDown.springify().damping(20).stiffness(150),

  // Transición para entradas de pantalla
  screenEntry: FadeInDown.duration(DURATIONS.normal).easing(EASINGS.decelerate),

  // Transición para elementos de lista
  listItem: FadeInDown.duration(DURATIONS.fast).easing(EASINGS.standard),

  // Transición de layout automática
  layout: Layout.duration(DURATIONS.normal),
};

/**
 * VALORES DE INTERACCIÓN
 */
export const INTERACTION = {
  pressedScale: 0.96,
  disabledOpacity: 0.5,
  activeOpacity: 1,
};
