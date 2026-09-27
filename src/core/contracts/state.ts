import type { SessionRecord } from "./session";
import type { Site } from "./sites";
import type { SettingsSnapshot } from "./settings";
import type { SystemHealthSnapshot } from "./permissions";
import type { FeedbackPayload } from "./feedback";
import type { EvidencePack } from "./evidence";

/**
 * Estado canónico que refleja la UI.
 *
 * Portado del WorkTrackerCanonicalState de GEOTrack, simplificado: el store
 * SOLO refleja (Propuesta Técnica §4.2: "Zustand solo refleja, no decide").
 * La única autoridad que muta sesiones es SessionEngineService, que escribe en
 * SQLite + ledger y después publica aquí el registro resultante.
 */
export interface DualTrackerState {
  boot: {
    isRehydrating: boolean;
    lastHydratedAtMs: number | null;
    /** Se detectó OS_KILL en esta rehidratación (Hoy muestra toast al entrar). */
    osKillDetected: boolean;
    bootError: string | null;
  };
  sessions: {
    byId: Record<string, SessionRecord>;
    /** Ids ordenados de más reciente a más antiguo. */
    order: number[];
    activeSessionId: number | null;
  };
  sites: {
    byId: Record<string, Site>;
    order: number[];
  };
  settings: SettingsSnapshot;
  health: SystemHealthSnapshot;
  /** Estado de desbloqueo = sesión de UI, no del adaptador (§4.8). */
  admin: {
    hasPin: boolean;
    isUnlocked: boolean;
    unlockedUntilMs: number | null;
    lockedUntilMs: number | null;
    status: "IDLE" | "validating" | "granted" | "denied" | "locked_out" | "error";
  };
  packs: {
    byId: Record<string, EvidencePack>;
    order: string[];
    /** FieldCrypto v1.3 §16: packs con al menos un asiento PACK_SHARED. */
    sharedIds: string[];
  };
  feedback: {
    pending: FeedbackPayload[];
  };
  /** Peticiones de UI originadas fuera de la vista (p. ej. notificación de salida). */
  uiRequests: {
    openExitModal: boolean;
    openDailySetup: "start" | "transit" | null;
  };
}
