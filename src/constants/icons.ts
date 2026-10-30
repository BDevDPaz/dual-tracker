/**
 * SEMANTIC ICONOGRAPHY - GEOTrack Trial and Trace
 * Mapeo de iconos basado en Ionicons.
 */

export const ICONS = {
  tabs: {
    home: { active: "grid", inactive: "grid-outline" },
    history: { active: "time", inactive: "time-outline" },
    report: { active: "document-text", inactive: "document-text-outline" },
    settings: { active: "settings", inactive: "settings-outline" },
  },

  status: {
    success: "checkmark-circle-outline",
    error: "alert-circle-outline",
    warning: "warning-outline",
    info: "information-circle-outline",
    neutral: "help-circle-outline",
  },

  actions: {
    add: "add-circle-outline",
    edit: "create-outline",
    delete: "trash-outline",
    close: "close",
    save: "save-outline",
    back: "chevron-back",
    forward: "chevron-forward",
    share: "share-outline",
    download: "download-outline",
    language: "language-outline",
    theme: "contrast-outline",
    lock: "lock-CLOSED-outline",
    unlock: "lock-open-outline",
  },

  domain: {
    location: "location-outline",
    time: "time-outline",
    session: "briefcase-outline",
    security: "shield-checkmark-outline",
    notification: "notifications-outline",
    report: "document-attach-outline",
    transit: "airplane-outline",
    lunch: "restaurant-outline",
  },

  // Mantener compatibilidad hacia atrás para sistema
  system: {
    success: "checkmark-circle-outline",
    error: "alert-circle-outline",
    warning: "warning-outline",
    info: "information-circle-outline",
    close: "close",
    back: "chevron-back",
    forward: "chevron-forward",
    lock: "lock-CLOSED",
    unlock: "lock-open",
    location: "location-outline",
    time: "time-outline",
  },
} as const;

export type IconName = string; // Para tipado flexible si es necesario
