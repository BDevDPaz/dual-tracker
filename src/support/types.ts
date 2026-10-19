import type { SessionState } from "../core/contracts";

/** Pantallas con botón de ayuda. El id abre `/support/guide/:id`. */
export const SCREEN_IDS = [
  "today",
  "history",
  "reports",
  "settings",
  "session",
  "trace",
  "sites",
  "siteNew",
  "siteEdit",
  "health",
  "conflict",
  "statement",
  "pack",
  "welcome",
  "onboardingDisclosure",
  "permissions",
  "profile",
  "legalDisclosure",
  "legalRetention",
  "notFound",
  "boot",
  "support",
  "practice",
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

/** Guías de flujo (recorrido paso a paso), distintas de la ayuda de una pantalla. */
export const FLOW_IDS = [
  "startManual",
  "startGeofence",
  "arrival",
  "transfer",
  "lunch",
  "closeManual",
  "closeAuto",
  "editNote",
  "forgotClock",
  "sealShare",
  "readStatement",
  "states",
] as const;

export type FlowId = (typeof FLOW_IDS)[number];

export const TIP_IDS = [
  "transferSameSession",
  "confirmArrivalInside",
  "lunch",
  "provisionalSeal",
  "splitWeek",
  "zeroRows",
  "forgotClock",
  "samsungBattery",
  "readDiag",
] as const;

export type TipId = (typeof TIP_IDS)[number];

export const FAQ_IDS = [
  "commute",
  "sameSession",
  "alwaysAllow",
  "precise",
  "samsung",
  "autoFail",
  "readDiag",
  "notifications",
  "language",
  "provisional",
  "splitWeek",
  "zeroRows",
  "practice",
  "offline",
] as const;

export type FaqId = (typeof FAQ_IDS)[number];

export const TROUBLE_IDS = [
  "permissionAlways",
  "preciseLocation",
  "samsungBattery",
  "autoCheckIn",
  "readDiag",
  "notifications",
  "language",
  "commute",
] as const;

export type TroubleId = (typeof TROUBLE_IDS)[number];

export const MACHINE_STATE_IDS: readonly SessionState[] = [
  "NO_INICIADA",
  "ESPERANDO",
  "ACTIVA",
  "PAUSADA",
  "TRASLADO",
  "SALIDA",
  "CERRADA",
];

export const INTEGRITY_IDS = ["VALID", "MANUAL", "AUTO", "CONFLICT", "BLOCKED"] as const;

export type IntegrityGuideId = (typeof INTEGRITY_IDS)[number];

export function isScreenId(id: string): id is ScreenId {
  return (SCREEN_IDS as readonly string[]).includes(id);
}

export function isFlowId(id: string): id is FlowId {
  return (FLOW_IDS as readonly string[]).includes(id);
}
