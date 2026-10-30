import AsyncStorage from "@react-native-async-storage/async-storage";
import { now, toDateString } from "../../utils/timeProvider";
import { SessionRecord, AppSettingsRecord, AuditLogRecord, SystemLogRecord } from "../contracts";

import * as DB from "../../database/db";

type AppSettings = any;
type WorkSession = any;

/**
 * Tipos internos de filas SQLite leídas directamente desde db.ts
 * para evitar acoplar el adapter a tipos externos incompletos.
 */
type DbWorkSessionRow = {
  id: number;
  start_time: number;
  actual_start_time: number | null;
  end_time: number | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  target_latitude: number | null;
  target_longitude: number | null;
  setup_latitude: number | null;
  setup_longitude: number | null;
  address: string | null;
  client_name: string | null;
  location_confirmed: number | null;
  is_manual_edit: number | null;
  manual_note: string | null;
  lunch_taken: number | null;
  lunch_start: number | null;
  lunch_end: number | null;
  date_string: string | null;

  total_paused_ms?: number | null;
  last_pause_start_ms?: number | null;
};

type DbAuditLogRow = {
  id: number;
  session_id: number | null;
  action_type: string;
  details: string;
  timestamp: number;
};

type DbSystemLogRow = {
  id: number;
  timestamp: number;
  timestamp_str: string;
  color: string;
  categoria: string;
  severidad: string;
  mensaje: string;
  metadata: string | null;

  user_id?: string | null;
  session_id?: number | null;
  from_state?: string | null;
  to_state?: string | null;
  event_type?: string | null;
  location?: string | null;
  device_state?: string | null;
  trigger_source?: string | null;
  reason?: string | null;
  signature?: string | null;
  event_state?: string | null;
  sync_status?: "PENDING" | "SYNCED" | "FAILED";
};

type DomainStatus = SessionRecord["lifecycle"]["domainStatus"];

/**
 * CONTRATO ESTRICTO:
 * El motor solo conoce estas funciones. No sabe que existe SQLite.
 */
export interface SessionStoreAdapter {
  createSession(session: Partial<SessionRecord>): Promise<number>;
  closeSession(id: number, endAtMs: number): Promise<void>;
  updateLunch(id: number, startAtMs: number, endAtMs: number): Promise<void>;
  updateSessionManual(
    id: number,
    startAtMs: number,
    endAtMs: number | null,
    note: string,
  ): Promise<void>;
  deleteSession(id: number): Promise<void>;
  checkOverlap(startAtMs: number, endAtMs: number, excludeId: number): Promise<boolean>;
  getSettings(): Promise<AppSettingsRecord | null>;
  saveSettings(settings: AppSettingsRecord): Promise<void>;
  confirmArrival(id: number, actualStartAtMs: number): Promise<void>;
  updateStatus(id: number, status: SessionRecord["lifecycle"]["domainStatus"]): Promise<void>;
}

/**
 * Normaliza el estado de dominio desde SQLite hacia el contrato canónico.
 */
function normalizeDomainStatus(rawStatus: string | null | undefined): DomainStatus {
  switch (rawStatus) {
    case "GEOFENCE_CREATED":
    case "TRAVEL":
    case "ACTIVE_WORK":
    case "PAUSED":
    case "PENDING_EXIT_CONFIRMATION":
    case "CLOSED":
      return rawStatus;
    default:
      return "GEOFENCE_CREATED";
  }
}

/**
 * Convierte un SessionRecord parcial en el payload real esperado por SQLite.
 */
function mapCanonicalSessionToDb(session: Partial<SessionRecord>): WorkSession {
  const declaredStartAtMs = session.declaredStartAtMs ?? now();
  const actualStartAtMs = session.actualStartAtMs ?? null;
  const endAtMs = session.endAtMs ?? null;

  const lifecycle = session.lifecycle ?? {
    domainStatus: "GEOFENCE_CREATED" as DomainStatus,
    isDeleted: false,
    isManualEdit: false,
    locationConfirmed: false,
    totalPausedMs: 0,
    lastPauseStartMs: null,
  };

  return {
    id: session.id,
    start_time: declaredStartAtMs,
    actual_start_time: actualStartAtMs,
    end_time: endAtMs,
    status: lifecycle.isDeleted ? "CLOSED" : lifecycle.domainStatus,
    latitude: session.capturedLocation?.latitude ?? null,
    longitude: session.capturedLocation?.longitude ?? null,
    target_latitude: session.destination?.targetLatitude ?? null,
    target_longitude: session.destination?.targetLongitude ?? null,
    setup_latitude: session.destination?.setupLatitude ?? null,
    setup_longitude: session.destination?.setupLongitude ?? null,
    address: session.destination?.address ?? "",
    client_name: session.destination?.clientName ?? "",
    location_confirmed: lifecycle.locationConfirmed ? 1 : 0,
    is_manual_edit: lifecycle.isManualEdit ? 1 : 0,
    manual_note: session.notes?.manualNote ?? "",
    lunch_taken: session.lunch?.taken ? 1 : 0,
    lunch_start: session.lunch?.startAtMs ?? null,
    lunch_end: session.lunch?.endAtMs ?? null,
    total_paused_ms: lifecycle.totalPausedMs ?? 0,
    last_pause_start_ms: lifecycle.lastPauseStartMs ?? null,
    date_string: session.bookkeeping?.dateString ?? toDateString(declaredStartAtMs),
  } as WorkSession;
}

/**
 * Convierte una fila SQLite a SessionRecord canónico.
 */
function mapDbSessionToCanonical(row: DbWorkSessionRow): SessionRecord {
  const domainStatus = normalizeDomainStatus(row.status);

  return {
    id: row.id,
    declaredStartAtMs: row.start_time,
    actualStartAtMs: row.actual_start_time ?? null,
    endAtMs: row.end_time ?? null,
    lifecycle: {
      domainStatus,
      isDeleted: domainStatus === "CLOSED",
      isManualEdit: Boolean(row.is_manual_edit),
      locationConfirmed: Boolean(row.location_confirmed),
      totalPausedMs: row.total_paused_ms ?? 0,
      lastPauseStartMs: row.last_pause_start_ms ?? null,
    },
    destination: {
      address: row.address ?? null,
      clientName: row.client_name ?? null,
      targetLatitude: row.target_latitude ?? null,
      targetLongitude: row.target_longitude ?? null,
      setupLatitude: row.setup_latitude ?? null,
      setupLongitude: row.setup_longitude ?? null,
    },
    capturedLocation: {
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
    },
    lunch: {
      taken: Boolean(row.lunch_taken),
      startAtMs: row.lunch_start ?? null,
      endAtMs: row.lunch_end ?? null,
      deductedMinutes:
        row.lunch_taken && row.lunch_start && row.lunch_end
          ? Math.max(0, Math.round((row.lunch_end - row.lunch_start) / 60000))
          : row.lunch_taken
            ? 60
            : null,
    },
    notes: {
      manualNote: row.manual_note ?? null,
    },
    bookkeeping: {
      dateString: row.date_string ?? null,
    },
  };
}

/**
 * Convierte settings SQLite a AppSettingsRecord canónico.
 */
function mapDbSettingsToCanonical(rawSettings: AppSettings): AppSettingsRecord {
  return {
    employeeName: rawSettings.employee_name ?? "",
    employerName: rawSettings.employer_name ?? "",
    companyEmail: rawSettings.company_email ?? "",
    toleranceRadiusMeters: rawSettings.tolerance_radius ?? 200,
    hourlyRate: rawSettings.hourly_rate ?? 0,
    language: (rawSettings.language as "es" | "en") ?? "es",
    dailyReminderTime: rawSettings.start_time ?? "07:00",
    overtimeMultiplier: rawSettings.overtime_multiplier ?? 1.5,
    onboardingCompleted: false,
    disclaimerAccepted: false,
  };
}

/**
 * Convierte AppSettingsRecord canónico a payload SQLite.
 */
function mapCanonicalSettingsToDb(settings: AppSettingsRecord): AppSettings {
  return {
    id: 1,
    employee_name: settings.employeeName,
    employer_name: settings.employerName,
    company_email: settings.companyEmail,
    tolerance_radius: settings.toleranceRadiusMeters,
    hourly_rate: settings.hourlyRate,
    language: settings.language,
    start_time: settings.dailyReminderTime,
    overtime_multiplier: settings.overtimeMultiplier,
  } as AppSettings;
}

export const sessionStore: SessionStoreAdapter = {
  async createSession(session: Partial<SessionRecord>): Promise<number> {
    const dbPayload = mapCanonicalSessionToDb(session);
    const insertedId = await DB.insertWorkSession(dbPayload);

    const normalizedId = Number(insertedId);

    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
      throw new Error("La base de datos no devolvió un ID válido al crear la sesión.");
    }

    return normalizedId;
  },

  async closeSession(id: number, endAtMs: number): Promise<void> {
    await DB.updateSessionEndTime(id, endAtMs);
  },

  async updateLunch(id: number, startAtMs: number, endAtMs: number): Promise<void> {
    await DB.updateSessionLunch(id, startAtMs, endAtMs);
  },

  async updateSessionManual(
    id: number,
    startAtMs: number,
    endAtMs: number | null,
    note: string,
  ): Promise<void> {
    await DB.updateWorkSessionManual(id, startAtMs, endAtMs, note);
  },

  async deleteSession(id: number): Promise<void> {
    await DB.deleteWorkSession(id);
  },

  async checkOverlap(startAtMs: number, endAtMs: number, excludeId: number): Promise<boolean> {
    return DB.checkSessionOverlap(startAtMs, endAtMs, excludeId);
  },

  async getSettings(): Promise<AppSettingsRecord | null> {
    const rawSettings = await DB.getSettings();

    if (!rawSettings) {
      return null;
    }

    const settings = mapDbSettingsToCanonical(rawSettings);

    try {
      const onboarding = await AsyncStorage.getItem("wtracker_onboarding_completed");
      const disclaimer = await AsyncStorage.getItem("wtracker_disclaimer_accepted");

      settings.onboardingCompleted = onboarding === "true";
      settings.disclaimerAccepted = disclaimer === "true";
    } catch {
      // Silent catch to keep settings hydration resilient.
    }

    return settings;
  },

  async saveSettings(settings: AppSettingsRecord): Promise<void> {
    const dbPayload = mapCanonicalSettingsToDb(settings);
    await DB.saveSettings(dbPayload);

    try {
      await AsyncStorage.setItem(
        "wtracker_onboarding_completed",
        String(settings.onboardingCompleted),
      );
      await AsyncStorage.setItem(
        "wtracker_disclaimer_accepted",
        String(settings.disclaimerAccepted),
      );
    } catch {
      // Silent catch to keep settings persistence resilient.
    }
  },

  async confirmArrival(id: number, actualStartAtMs: number): Promise<void> {
    await DB.confirmSessionArrival(id, actualStartAtMs);
  },

  async updateStatus(
    id: number,
    status: SessionRecord["lifecycle"]["domainStatus"],
  ): Promise<void> {
    await DB.updateSessionStatus(id, status);
  },
};

/**
 * ============================================================================
 * SNAPSHOT LOADERS (Base para rehidratación real)
 * ============================================================================
 * Estos exports adicionales no rompen el contrato del engine actual.
 * Se usan para reconstruir el estado canónico desde SQLite durante boot.
 */

export async function loadSessionRecordsSnapshot(): Promise<SessionRecord[]> {
  const rows = await DB.getAllAsync<DbWorkSessionRow>(
    `
      SELECT *
      FROM work_sessions
      ORDER BY start_time ASC
    `,
  );

  return rows.map(mapDbSessionToCanonical);
}

export async function loadOpenSessionSnapshot(): Promise<SessionRecord | null> {
  const row = await DB.getOpenSession();

  if (!row) {
    return null;
  }

  return mapDbSessionToCanonical(row as unknown as DbWorkSessionRow);
}

export async function loadSettingsRecordSnapshot(): Promise<AppSettingsRecord | null> {
  const settings = await sessionStore.getSettings();
  return settings;
}

export async function loadAuditLogRecordsSnapshot(): Promise<AuditLogRecord[]> {
  const rows = await DB.getAllAsync<DbAuditLogRow>(
    `
      SELECT *
      FROM audit_logs
      ORDER BY timestamp ASC, id ASC
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id ?? null,
    actionType: row.action_type,
    details: row.details,
    timestampMs: row.timestamp,
  }));
}

export async function loadSystemLogRecordsSnapshot(): Promise<SystemLogRecord[]> {
  const rows = await DB.getAllAsync<DbSystemLogRow>(
    `
      SELECT *
      FROM system_logs
      ORDER BY timestamp ASC, id ASC
    `,
  );

  return rows.map((row) => ({
    user_id: row.user_id ?? null,
    session_id: row.session_id ?? null,
    from_state: row.from_state ?? null,
    to_state: row.to_state ?? null,
    event_type: row.event_type ?? null,
    location: row.location ?? null,
    device_state: row.device_state ?? null,
    trigger_source: row.trigger_source ?? null,
    reason: row.reason ?? null,
    signature: row.signature ?? null,
    event_state: row.event_state ?? null,
    sync_status: row.sync_status ?? "PENDING",

    id: row.id,
    timestampMs: row.timestamp,
    timestampIso: row.timestamp_str,
    color: row.color,
    category: row.categoria,
    severity: row.severidad,
    message: row.mensaje,
    metadataJson: row.metadata ?? null,
  }));
}
