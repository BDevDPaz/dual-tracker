import type { FieldSpec } from "./formChain";

/**
 * Orden de cada formulario de la app. Las pantallas y las pruebas leen la misma lista:
 * "next" avanza, el último campo de una línea es "done" (o "search") y envía si es válido.
 */
export const FORM_FIELDS = {
  editSession: [
    { id: "start", kind: "time" },
    { id: "end", kind: "time" },
    { id: "note", multiline: true },
  ],
  lunchStart: [{ id: "start", kind: "time" }],
  dailySetup: [
    { id: "address", kind: "text" },
    { id: "alias", kind: "text" },
    { id: "client", kind: "text" },
  ],
  addNote: [{ id: "note", multiline: true }],
  onboardingProfile: [
    { id: "name", kind: "name" },
    { id: "rate", kind: "decimal" },
    { id: "reminder", kind: "time" },
  ],
  settingsProfile: [
    { id: "name", kind: "name" },
    { id: "reminder", kind: "time" },
  ],
  settingsPin: [{ id: "pin", kind: "pin" }],
  settingsAdmin: [
    { id: "rate", kind: "decimal" },
    { id: "multiplier", kind: "decimal" },
    { id: "employer", kind: "text" },
    { id: "email", kind: "email" },
    { id: "retention", kind: "integer" },
    { id: "radius", kind: "integer" },
  ],
  settingsCalendar: [{ id: "start", kind: "time" }],
  siteNew: [
    { id: "alias", kind: "text" },
    { id: "address", kind: "text" },
    { id: "client", kind: "text" },
    { id: "notes", multiline: true },
    { id: "radius", kind: "integer" },
  ],
  siteRadius: [{ id: "radius", kind: "integer" }],
  siteSearch: [{ id: "search", kind: "search" }],
  practiceNote: [{ id: "note", kind: "text" }],
  conflictNote: [{ id: "note", multiline: true }],
  healthPin: [{ id: "pin", kind: "pin" }],
} as const satisfies Record<string, readonly FieldSpec[]>;

export type FormId = keyof typeof FORM_FIELDS;
