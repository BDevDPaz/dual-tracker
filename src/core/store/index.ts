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
import { canonicalJson } from "../../utils/canonicalJson";
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

function sessionsSlice(sessions: SessionRecord[]): DualTrackerState["sessions"] {
  const byId: Record<string, SessionRecord> = {};
  sessions.forEach((s) => (byId[String(s.id)] = s));
  return { byId, order: sortIdsByStartDesc(byId), activeSessionId: findActive(byId) };
}

function sitesSlice(sites: Site[]): DualTrackerState["sites"] {
  const byId: Record<string, Site> = {};
  sites.forEach((s) => (byId[String(s.id)] = s));
  return { byId, order: sites.map((s) => s.id) };
}

function packsSlice(packs: EvidencePack[], sharedIds: string[]): DualTrackerState["packs"] {
  const byId: Record<string, EvidencePack> = {};
  packs.forEach((p) => (byId[p.id] = p));
  return { byId, order: packs.map((p) => p.id), sharedIds: [...new Set(sharedIds)].sort() };
}

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
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
    /** §16: ids de packs ya compartidos (asientos PACK_SHARED). */
    sharedPackIds?: string[];
    settings: SettingsSnapshot;
    osKillDetected: boolean;
    hasPin: boolean;
    pinOrigin?: DualTrackerState["admin"]["pinOrigin"];
    nowMs: number;
  }): void {
    commit({
      ...state,
      boot: { isRehydrating: false, lastHydratedAtMs: input.nowMs, osKillDetected: input.osKillDetected, bootError: null },
      sessions: sessionsSlice(input.sessions),
      sites: sitesSlice(input.sites),
      packs: packsSlice(input.packs, input.sharedPackIds ?? state.packs.sharedIds),
      settings: input.settings,
      admin: { ...state.admin, hasPin: input.hasPin, pinOrigin: input.pinOrigin ?? state.admin.pinOrigin },
    });
  },

  /**
   * Relee el reflejo sin pasar por el arranque. Conserva salud, admin
   * (incluido el desbloqueo), feedback y peticiones de UI. No pone
   * isRehydrating (eso vaciaría las tabs). Devuelve false si nada cambió,
   * para no re-renderizar ni pisar un borrador de Ajustes.
   */
  refreshed(input: {
    sessions: SessionRecord[];
    sites: Site[];
    packs: EvidencePack[];
    sharedPackIds?: string[];
    settings: SettingsSnapshot;
    nowMs: number;
  }): boolean {
    const sessions = sameJson(state.sessions, sessionsSlice(input.sessions)) ? state.sessions : sessionsSlice(input.sessions);
    const sites = sameJson(state.sites, sitesSlice(input.sites)) ? state.sites : sitesSlice(input.sites);
    const packs = sameJson(state.packs, packsSlice(input.packs, input.sharedPackIds ?? state.packs.sharedIds))
      ? state.packs
      : packsSlice(input.packs, input.sharedPackIds ?? state.packs.sharedIds);
    const settings = sameJson(state.settings, input.settings) ? state.settings : input.settings;
    if (sessions === state.sessions && sites === state.sites && packs === state.packs && settings === state.settings) {
      return false;
    }
    commit({
      ...state,
      boot: { ...state.boot, lastHydratedAtMs: input.nowMs },
      sessions,
      sites,
      packs,
      settings,
    });
    return true;
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

  /** FieldCrypto v1.3 §11 paso 7: estado del cifrado para la UI (sin importar servicios). */
  cryptoHealth(fieldCrypto: SystemHealthSnapshot["fieldCrypto"]): void {
    commit({ ...state, health: { ...state.health, fieldCrypto } });
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
      packs: {
        ...state.packs,
        byId: { ...state.packs.byId, [pack.id]: pack },
        order: exists ? state.packs.order : [pack.id, ...state.packs.order],
      },
    });
  },

  /** FieldCrypto v1.3 §16: el pack se compartió (asiento PACK_SHARED ya escrito). */
  packShared(packId: string): void {
    if (state.packs.sharedIds.includes(packId)) return;
    commit({ ...state, packs: { ...state.packs, sharedIds: [...state.packs.sharedIds, packId] } });
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
    commit({
      ...state,
      uiRequests: { openExitModal: false, openDailySetup: null, openExtendConfirm: false, correctSessionId: null, openOrphanReview: false, openHealth: false, openMoveSite: false, dismissArrival: false },
    });
  },
};

export { createInitialState };
