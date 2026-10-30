import { now } from "../../utils/timeProvider";
import { WorkTrackerCanonicalState, SessionRecord } from "../contracts";
import { calculateSessionDurationWithPause, calculatePay } from "../../utils/payrollUtils";

export const selectActiveSession = (state: WorkTrackerCanonicalState): SessionRecord | null => {
  const { activeSessionId, byId } = state.domain.sessions;
  if (!activeSessionId) return null;
  const session = (byId as any)[activeSessionId] || null;
  if (session?.lifecycle.isDeleted) return null;
  return session;
};

export const selectEngineState = (state: WorkTrackerCanonicalState): string => {
  const activeSession = selectActiveSession(state);
  if (!activeSession) return "IDLE";

  const { domainStatus } = activeSession.lifecycle;
  const { lastExitTimestampMs } = state.runtime.geofence;

  if (domainStatus === "TRAVEL") return "TRAVEL";
  if (domainStatus === "GEOFENCE_CREATED") return "GEOFENCE_CREATED";
  if (domainStatus === "PAUSED") return "PAUSED";

  if (domainStatus === "ACTIVE_WORK") {
    if (lastExitTimestampMs) return "PENDING_EXIT_CONFIRMATION";
    return "ACTIVE_WORK";
  }

  return "CLOSED";
};

export const selectSystemHealth = (state: WorkTrackerCanonicalState) => {
  const { locationForeground, locationBackground } = state.runtime.permissions;
  const { isMonitoring } = state.runtime.geofence;
  const { isRunning: isBackgroundRunning } = state.runtime.background.appTask;

  const isLocationGranted = locationForeground === "granted" && locationBackground === "granted";

  return {
    isGpsActive: isLocationGranted && isMonitoring,
    isGpsError: !isLocationGranted || (isMonitoring && !isBackgroundRunning),
    isSyncing: state.meta.bootState.isRehydrating,
    isSyncError: false,
  };
};

export interface ComputedPayrollSession extends SessionRecord {
  computedHours: number;
  computedPay: number;
}

/**
 * UI estimate for lists. Sync, no hash.
 * Authoritative payroll: payrollEngineService.computeStatement.
 */
export const selectComputedSessions = (
  state: WorkTrackerCanonicalState,
): ComputedPayrollSession[] => {
  const { byId, order } = state.domain.sessions;
  const { hourlyRate, overtimeMultiplier } = state.domain.settings;

  const validSessions = order
    .map((id) => (byId as any)[id])
    .filter((s): s is SessionRecord => !!s && !s.lifecycle.isDeleted);

  return validSessions.map((session) => {
    const isPendingExit =
      session.lifecycle.domainStatus === "ACTIVE_WORK" &&
      state.runtime.geofence.lastExitTimestampMs !== null;

    let endTimeToUse = session.endAtMs || now();
    if (isPendingExit) {
      endTimeToUse = state.runtime.geofence.lastExitTimestampMs || now();
    }

    const startTimeToUse = session.actualStartAtMs || session.declaredStartAtMs;

    const currentPauseMs =
      session.lifecycle.domainStatus === "PAUSED" && session.lifecycle.lastPauseStartMs
        ? now() - session.lifecycle.lastPauseStartMs
        : 0;

    const durationMs = calculateSessionDurationWithPause(
      startTimeToUse,
      endTimeToUse,
      session.lunch.taken ? 1 : 0,
      (session.lifecycle.totalPausedMs || 0) + currentPauseMs,
      session.lunch.startAtMs || undefined,
      session.lunch.endAtMs || undefined,
    );

    const hours = durationMs / (1000 * 60 * 60);
    const { totalPay } = calculatePay(hours, hourlyRate, overtimeMultiplier);

    return {
      ...session,
      computedHours: hours,
      computedPay: totalPay,
    };
  });
};

export const selectPendingFeedback = (state: WorkTrackerCanonicalState) => {
  return state.runtime.transient.pendingFeedback;
};

export const selectIsAdminUnlocked = (state: WorkTrackerCanonicalState) => {
  return state.runtime.security.adminAccess.isUnlocked;
};

export const selectIsHydrated = (state: WorkTrackerCanonicalState) => {
  return !state.meta.bootState.isRehydrating;
};

export const selectNeedsOnboarding = (state: WorkTrackerCanonicalState) => {
  return !state.domain.settings.onboardingCompleted;
};

export const selectNeedsDisclaimer = (state: WorkTrackerCanonicalState) => {
  return !state.domain.settings.disclaimerAccepted;
};
