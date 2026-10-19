/**
 * Mapa de Soporte. Las frases viven en i18n (`support.*`); aquí solo hay claves.
 * El contenido va versionado con la app (`SUPPORT_CONTENT_VERSION`).
 */
import type { SessionState } from "../core/contracts";
import {
  FAQ_IDS,
  FLOW_IDS,
  INTEGRITY_IDS,
  MACHINE_STATE_IDS,
  SCREEN_IDS,
  TIP_IDS,
  TROUBLE_IDS,
  type FaqId,
  type FlowId,
  type IntegrityGuideId,
  type ScreenId,
  type TipId,
  type TroubleId,
} from "./types";

export interface GuideStep {
  title: string;
  body: string;
  /** Clave i18n del control que el recorrido resalta. */
  mark: string;
}

export interface FlowGuide {
  id: FlowId;
  title: string;
  steps: GuideStep[];
}

export interface ScreenGuide {
  id: ScreenId;
  title: string;
  intro: string;
  steps: GuideStep[];
  flows: readonly FlowId[];
}

function flow(id: FlowId, marks: string[]): FlowGuide {
  return {
    id,
    title: `support.flows.${id}.title`,
    steps: marks.map((mark, i) => ({
      title: `support.flows.${id}.s${i}.title`,
      body: `support.flows.${id}.s${i}.body`,
      mark,
    })),
  };
}

function screen(id: ScreenId, flows: readonly FlowId[], marks: [string, string]): ScreenGuide {
  return {
    id,
    title: `support.screens.${id}.title`,
    intro: `support.screens.${id}.intro`,
    flows,
    steps: [0, 1].map((i) => ({
      title: `support.screens.${id}.s${i}.title`,
      body: `support.screens.${id}.s${i}.body`,
      mark: marks[i],
    })),
  };
}

export const FLOWS: Record<FlowId, FlowGuide> = {
  startManual: flow("startManual", ["cta.startDay", "states.ESPERANDO.label", "cta.confirmArrival"]),
  startGeofence: flow("startGeofence", ["health.sensors.locationBackground", "today.geofenceOn", "health.diag.title"]),
  arrival: flow("arrival", ["cta.confirmArrival", "states.ACTIVA.label"]),
  transfer: flow("transfer", ["modals.exitTransfer", "cta.confirmArrival", "modals.startTransit"]),
  lunch: flow("lunch", ["cta.startLunch", "modals.lunchTitle", "cta.resume"]),
  closeManual: flow("closeManual", ["cta.closeDay", "cta.confirmExit"]),
  closeAuto: flow("closeAuto", ["states.SALIDA.label", "integrity.AUTO"]),
  editNote: flow("editNote", ["cta.reviewSession", "modals.editNote"]),
  forgotClock: flow("forgotClock", ["modals.editTitle", "ledger.MANUAL_PATCH"]),
  sealShare: flow("sealShare", ["reports.generate", "reports.packEarly", "reports.shareEmployee"]),
  readStatement: flow("readStatement", ["support.marks.continuesMonday", "common.minutes", "reports.zeroRowsOmitted"]),
  states: flow("states", ["states.ACTIVA.label", "integrity.VALID", "integrity.BLOCKED"]),
};

export const SCREEN_GUIDES: Record<ScreenId, ScreenGuide> = {
  today: screen("today", ["startManual", "startGeofence", "arrival", "transfer", "lunch", "closeManual", "closeAuto"], ["cta.startDay", "modals.exitTransfer"]),
  history: screen("history", ["forgotClock", "readStatement", "states"], ["history.title", "support.marks.continuesMonday"]),
  reports: screen("reports", ["sealShare", "readStatement"], ["reports.generate", "reports.packEarly"]),
  settings: screen("settings", [], ["support.title", "onboarding.language"]),
  session: screen("session", ["editNote", "forgotClock"], ["common.edit", "modals.editNote"]),
  trace: screen("trace", ["arrival"], ["trace.title", "trace.unreliable"]),
  sites: screen("sites", ["startManual", "transfer"], ["sites.newSite", "cta.manageSites"]),
  siteNew: screen("siteNew", ["startManual"], ["sites.address", "modals.activateGeofence"]),
  siteEdit: screen("siteEdit", ["startManual"], ["common.save", "sites.radius"]),
  health: screen("health", ["startGeofence"], ["health.diag.title", "health.repair"]),
  conflict: screen("conflict", ["states"], ["conflict.keepGps", "conflict.acceptManual"]),
  statement: screen("statement", ["readStatement"], ["report.statement", "common.minutes"]),
  pack: screen("pack", ["sealShare"], ["report.hash", "reports.shareEmployee"]),
  welcome: screen("welcome", ["startManual"], ["common.continue", "app.tagline"]),
  onboardingDisclosure: screen("onboardingDisclosure", [], ["onboarding.acceptCheckbox", "settings.disclosure"]),
  permissions: screen("permissions", ["startGeofence"], ["onboarding.permBgTitle", "onboarding.permNotifTitle"]),
  profile: screen("profile", [], ["onboarding.language", "onboarding.enter"]),
  legalDisclosure: screen("legalDisclosure", [], ["settings.disclosure", "common.back"]),
  legalRetention: screen("legalRetention", [], ["settings.retentionPolicy", "common.back"]),
  notFound: screen("notFound", [], ["notFound.goHome", "a11y.back"]),
  boot: screen("boot", [], ["boot.restoring", "common.retry"]),
  support: screen("support", FLOW_IDS, ["support.manual", "support.practice.enter"]),
  practice: screen("practice", ["transfer", "startManual", "sealShare", "readStatement", "states"], ["support.practice.banner", "support.practice.exit"]),
};

export interface TipContext {
  screen: ScreenId;
  sessionState: SessionState | null;
  siteCount: number;
  batteryRestricted: boolean;
  provisionalSeal: boolean;
  hasSplitRow: boolean;
  hasZeroOmitted: boolean;
}

const OPEN: readonly SessionState[] = ["ESPERANDO", "ACTIVA", "PAUSADA", "TRASLADO", "SALIDA"];

/** Orden = prioridad. La UI muestra el primero que no esté descartado. */
export function tipsFor(ctx: TipContext): TipId[] {
  const out: TipId[] = [];
  const open = ctx.sessionState !== null && OPEN.includes(ctx.sessionState);
  const transferMoment =
    ctx.screen === "today" &&
    (ctx.sessionState === "TRASLADO" ||
      ctx.sessionState === "SALIDA" ||
      (open && ctx.siteCount > 1 && ctx.sessionState !== "PAUSADA"));
  if (transferMoment) out.push("transferSameSession");
  if (ctx.screen === "today" && ctx.sessionState === "ESPERANDO") out.push("confirmArrivalInside");
  if (ctx.screen === "today" && ctx.sessionState === "ACTIVA") out.push("lunch");
  if ((ctx.screen === "today" || ctx.screen === "health") && ctx.batteryRestricted) out.push("samsungBattery");
  if ((ctx.screen === "reports" || ctx.screen === "statement") && ctx.provisionalSeal) out.push("provisionalSeal");
  if ((ctx.screen === "history" || ctx.screen === "reports" || ctx.screen === "statement" || ctx.screen === "pack") && ctx.hasSplitRow) {
    out.push("splitWeek");
  }
  if ((ctx.screen === "reports" || ctx.screen === "statement" || ctx.screen === "pack") && ctx.hasZeroOmitted) out.push("zeroRows");
  if (ctx.screen === "session" || ctx.screen === "history") out.push("forgotClock");
  if (ctx.screen === "health") out.push("readDiag");
  return out;
}

export function tipBodyKey(id: TipId): string {
  return `support.tips.${id}`;
}

export function allGuideKeys(): string[] {
  const keys: string[] = [];
  for (const flow of Object.values(FLOWS)) {
    keys.push(flow.title);
    for (const step of flow.steps) keys.push(step.title, step.body, step.mark);
  }
  for (const guide of Object.values(SCREEN_GUIDES)) {
    keys.push(guide.title, guide.intro);
    for (const step of guide.steps) keys.push(step.title, step.body, step.mark);
  }
  for (const id of TIP_IDS) keys.push(tipBodyKey(id));
  for (const id of FAQ_IDS) keys.push(`support.faq.${id}.q`, `support.faq.${id}.a`);
  for (const id of TROUBLE_IDS) keys.push(`support.trouble.${id}.title`, `support.trouble.${id}.body`);
  for (const id of MACHINE_STATE_IDS) keys.push(`support.glossary.machine.${id}`);
  for (const id of INTEGRITY_IDS) keys.push(`support.glossary.integrity.${id}`);
  keys.push("support.glossary.manualPatch");
  return keys;
}

export { FAQ_IDS, FLOW_IDS, INTEGRITY_IDS, MACHINE_STATE_IDS, SCREEN_IDS, TIP_IDS, TROUBLE_IDS };
export type { FaqId, FlowId, IntegrityGuideId, ScreenId, TipId, TroubleId };
