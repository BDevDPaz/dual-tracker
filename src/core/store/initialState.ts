/**
 * Estado inicial del store de reflejo. Portado de GEOTrack
 * (src/core/state/initialState.ts) y reducido a DualTrackerState.
 */
import type { DualTrackerState, SystemHealthSnapshot } from "../contracts";
import { DEFAULT_COMPANY_POLICY, DEFAULT_DEVICE_PREFS, DEFAULT_PROFILE } from "../../services/persistence/SettingsService";

export const INITIAL_HEALTH: SystemHealthSnapshot = {
  locationForeground: "unknown",
  locationBackground: "unknown",
  notifications: "unknown",
  foregroundService: "unknown",
  batteryOptimization: "unknown",
  clockDriftMs: 0,
  clockDriftExceeded: false,
  isMonitoring: false,
  lastSpatialFactAt: null,
  locationServicesEnabled: null,
  checkedAtMs: null,
  ledger: { broken: null, acknowledgedBreaks: 0 },
  fieldCrypto: { status: "UNINITIALIZED", lostKids: [], affectedSessionIds: [], platformSupported: true },
};

export function createInitialState(): DualTrackerState {
  return {
    boot: { isRehydrating: true, lastHydratedAtMs: null, osKillDetected: false, bootError: null },
    sessions: { byId: {}, order: [], activeSessionId: null },
    sites: { byId: {}, order: [] },
    settings: { profile: { ...DEFAULT_PROFILE }, company: { ...DEFAULT_COMPANY_POLICY }, device: { ...DEFAULT_DEVICE_PREFS } },
    health: { ...INITIAL_HEALTH },
    admin: { hasPin: false, isUnlocked: false, unlockedUntilMs: null, lockedUntilMs: null, status: "IDLE" },
    packs: { byId: {}, order: [] },
    feedback: { pending: [] },
    uiRequests: { openExitModal: false, openDailySetup: null },
  };
}
