/**
 * Store de REFLEJO (Propuesta Técnica §2 y §10)
 * ============================================================================
 * "La UI refleja el store; no decide transiciones de dominio."
 *
 * A diferencia del WorkTrackerEngine de GEOTrack (reducer + effects que
 * decidían transiciones), este store solo refleja lo que los servicios ya
 * persistieron: SessionEngineService escribe SQLite + ledger y DESPUÉS publica
 * aquí. Se conserva la mecánica subscribe/getState/notify del engine original.
 *
 * Solo los servicios llaman a `StoreActions.*`. Las vistas leen vía
 * useWorkTracker + selectores.
 */
import type {
  DualTrackerState,
  EvidencePack,
  FeedbackPayload,
  SessionRecord,
  SettingsSnapshot,
  Site,
  SystemHealthSnapshot,
} from "../contracts";
import { OPEN_SESSION_STATES } from "../contracts";
import { createInitialState } from "./initialState";

type Listener = (state: DualTrackerState) => void;

let state: DualTrackerState = createInitialState();
const listeners = new Set<Listener>();

function commit(next: DualTrackerState): void {
  state = next;
  listeners.forEach((l) => {
    try {
      l(state);
    } catch (error) {
      if (__DEV__) console.error("[Store] Error en listener:", error);
    }
  });
}

function sortIdsByStartDesc(byId: Record<string, SessionRecord>): number[] {
  return Object.values(byId)
    .sort((a, b) => (b.actualStartAtMs ?? b.declaredStartAtMs) - (a.actualStartAtMs ?? a.declaredStartAtMs))
    .map((s) => s.id);
}

function findActive(byId: Record<string, SessionRecord>): number | null {
  const open = Object.values(byId).find(
    (s) => !s.bookkeeping.isDeleted && OPEN_SESSION_STATES.includes(s.domainStatus),
  );
  return open ? open.id : null;
}

export const Store = {
  getState(): DualTrackerState {
    return state;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Solo para pruebas. */
  reset(): void {
    commit(createInitialState());
  },
};

/** Mutaciones de reflejo. Uso exclusivo de la capa de servicios y boot. */
export const StoreActions = {
  hydrated(input: {
    sessions: SessionRecord[];
    sites: Site[];
    packs: EvidencePack[];
    settings: SettingsSnapshot;
    osKillDetected: boolean;
    hasPin: boolean;
    nowMs: number;
  }): void {
    const byId: Record<string, SessionRecord> = {};
    input.sessions.forEach((s) => (byId[String(s.id)] = s));
    const sitesById: Record<string, Site> = {};
    input.sites.forEach((s) => (sitesById[String(s.id)] = s));
    const packsById: Record<string, EvidencePack> = {};
    input.packs.forEach((p) => (packsById[p.id] = p));
    commit({
      ...state,
      boot: { isRehydrating: false, lastHydratedAtMs: input.nowMs, osKillDetected: input.osKillDetected, bootError: null },
      sessions: { byId, order: sortIdsByStartDesc(byId), activeSessionId: findActive(byId) },
      sites: { byId: sitesById, order: input.sites.map((s) => s.id) },
      packs: { byId: packsById, order: input.packs.map((p) => p.id) },
      settings: input.settings,
      admin: { ...state.admin, hasPin: input.hasPin },
    });
  },

  bootFailed(error: string): void {
    commit({ ...state, boot: { ...state.boot, isRehydrating: false, bootError: error } });
  },

  sessionUpserted(session: SessionRecord): void {
    const byId = { ...state.sessions.byId, [String(session.id)]: session };
    commit({ ...state, sessions: { byId, order: sortIdsByStartDesc(byId), activeSessionId: findActive(byId) } });
  },

  siteUpserted(site: Site): void {
    const exists = !!state.sites.byId[String(site.id)];
    commit({
      ...state,
      sites: {
        byId: { ...state.sites.byId, [String(site.id)]: site },
        order: exists ? state.sites.order : [...state.sites.order, site.id],
      },
    });
  },

  settingsReplaced(settings: SettingsSnapshot): void {
    commit({ ...state, settings });
  },

  healthUpdated(patch: Partial<SystemHealthSnapshot>): void {
    commit({ ...state, health: { ...state.health, ...patch } });
  },

  adminUpdated(patch: Partial<DualTrackerState["admin"]>): void {
    commit({ ...state, admin: { ...state.admin, ...patch } });
  },

  packUpserted(pack: EvidencePack): void {
    const exists = !!state.packs.byId[pack.id];
    commit({
      ...state,
      packs: { byId: { ...state.packs.byId, [pack.id]: pack }, order: exists ? state.packs.order : [pack.id, ...state.packs.order] },
    });
  },

  feedbackPushed(payload: FeedbackPayload): void {
    commit({ ...state, feedback: { pending: [...state.feedback.pending, payload] } });
  },

  feedbackDismissed(id: string): void {
    commit({ ...state, feedback: { pending: state.feedback.pending.filter((f) => f.id !== id) } });
  },

  uiRequest(patch: Partial<DualTrackerState["uiRequests"]>): void {
    commit({ ...state, uiRequests: { ...state.uiRequests, ...patch } });
  },

  uiRequestsConsumed(): void {
    commit({ ...state, uiRequests: { openExitModal: false, openDailySetup: null } });
  },
};

export { createInitialState };
