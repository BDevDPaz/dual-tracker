/**
 * Diccionario EN parcial. Lo que falte cae a ES (FeedbackService §5.14:
 * "si falta la traducción, cae a ES").
 * TODO(i18n): completar traducción.
 */
import type { Dictionary } from "./es";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

export const en: DeepPartial<Dictionary> = {
  app: { tagline: "Your time and your shift trail" },
  common: { cancel: "Cancel", save: "Save", edit: "Edit", delete: "Delete", close: "Close", continue: "Continue", back: "Back", retry: "Retry", loading: "Loading…" },
  states: {
    NO_INICIADA: { label: "Off duty", sub: "No open shift." },
    ESPERANDO: { label: "Waiting for arrival", sub: "Geofence active · check-in on arrival." },
    ACTIVA: { label: "On site", sub: "Shift in progress." },
    PAUSADA: { label: "On lunch", sub: "No trail during the break." },
    TRASLADO: { label: "In transit", sub: "Heading to the next site." },
    SALIDA: { label: "Exit detected", sub: "Decide what happened." },
    CERRADA: { label: "Shift closed", sub: "Review today's summary." },
  },
  cta: {
    startDay: "Start shift",
    cancelDay: "Cancel shift",
    viewDestination: "View site",
    closeDay: "Close shift",
    startLunch: "Start lunch",
    resume: "Resume",
    finishDay: "Finish shift",
    viewStatus: "View status",
    cancelTransfer: "Cancel transfer",
    confirmExit: "Confirm exit",
    stayWorking: "Still working",
    reviewSession: "Review session",
    newDay: "New shift",
  },
  boot: { restoring: "Restoring record…" },
  tabs: { today: "Today", history: "History", reports: "Reports", settings: "Settings" },
  notifications: {
    exitTitle: "You left the area",
    exitBody: "Did you finish your shift or are you going to another site?",
    actionStay: "Still working",
    actionClose: "Close shift",
    actionTransfer: "Transfer",
    reminderTitle: "Good morning",
    reminderBody: "Time to start your shift in Dual Tracker.",
    fgsBody: "Shift in progress · zone monitoring active",
  },
} as DeepPartial<Dictionary>;
