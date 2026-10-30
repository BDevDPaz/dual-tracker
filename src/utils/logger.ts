// --- src/utils/logger.ts ---
import * as SQLite from "expo-sqlite";
import dayjs from "./dayjsSetup";
import { emitFeedbackFromLog } from "../feedback/logBridge";
type LogColor = "VERDE" | "AMARILLO" | "NARANJA" | "AZUL" | "BLANCO" | "ROJO";
type LogCategory = string;
type LogSeverity = "INFO" | "WARN" | "ERROR" | "DEBUG" | "EVENT";

type SystemLogEntry = {
  timestamp: number;
  timestamp_str: string;
  color: LogColor;
  categoria: LogCategory;
  severidad: LogSeverity;
  mensaje: string;
  metadata?: string;
  session_id?: number | null;
  event_type?: string | null;
  trigger_source?: string | null;
  reason?: string | null;
  from_state?: string | null;
  to_state?: string | null;
  sync_status?: "PENDING" | "SYNCED" | "FAILED";
};

// Cola temporal mientras la DB no está inicializada
const logQueue: SystemLogEntry[] = [];
const auditQueue: AuditLogEntry[] = [];

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const AUDIT_ACTIONS = {
  AUTO_CHECKIN: "AUTO_CHECKIN",
  AUTO_CHECKOUT: "AUTO_CHECKOUT",
  MANUAL: "MANUAL",
  OVERLAP: "OVERLAP",
  MUTEX: "MUTEX",
  LOCATION: "LOCATION",
  PDF: "PDF",
  PAYROLL: "PAYROLL",
  DB: "DB",
} as const;

export interface AuditLogEntry {
  session_id: number | null;
  action_type: string;
  details: string;
  timestamp: number;
}

export const setLoggerDB = (db: SQLite.SQLiteDatabase) => {
  dbInstance = db;
  void flushLogQueue();
  void flushAuditQueue();
};

const flushLogQueue = async () => {
  if (!dbInstance) return;

  while (logQueue.length > 0) {
    const entry = logQueue.shift();
    if (entry) {
      await saveSystemLogToDb(entry);
    }
  }
};

const flushAuditQueue = async () => {
  if (!dbInstance) return;

  while (auditQueue.length > 0) {
    const entry = auditQueue.shift();
    if (entry) {
      await saveAuditToDb(entry);
    }
  }
};

const saveSystemLogToDb = async (entry: SystemLogEntry) => {
  if (!dbInstance) return;

  try {
    await dbInstance.runAsync(
      `INSERT INTO system_logs (
        timestamp,
        timestamp_str,
        color,
        categoria,
        severidad,
        mensaje,
        metadata,
        session_id,
        event_type,
        trigger_source,
        reason,
        from_state,
        to_state,
        sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.timestamp,
        entry.timestamp_str,
        entry.color,
        entry.categoria,
        entry.severidad,
        entry.mensaje,
        entry.metadata ?? null,
        entry.session_id ?? null,
        entry.event_type ?? null,
        entry.trigger_source ?? null,
        entry.reason ?? null,
        entry.from_state ?? null,
        entry.to_state ?? null,
        entry.sync_status ?? "PENDING",
      ],
    );
  } catch (e) {
    if (__DEV__) {
      const c = console;
      c["error"]("❌ Fallo crítico al guardar log en DB de auditoría:", e);
    }
  }
};

const saveAuditToDb = async (entry: AuditLogEntry) => {
  if (!dbInstance) return;

  try {
    await dbInstance.runAsync(
      `INSERT INTO audit_logs (
        session_id,
        action_type,
        details,
        timestamp
      ) VALUES (?, ?, ?, ?)`,
      [entry.session_id, entry.action_type, entry.details, entry.timestamp],
    );
  } catch (e) {
    if (__DEV__) {
      const c = console;
      c["error"]("❌ Fallo crítico al guardar audit_log en DB:", e);
    }
  }
};

export const logAudit = async (entry: AuditLogEntry): Promise<void> => {
  if (dbInstance) {
    await saveAuditToDb(entry);
  } else {
    auditQueue.push(entry);
  }
};

function safeSerializeMetadata(metadata: unknown): string | undefined {
  if (metadata === undefined) return undefined;

  try {
    if (metadata instanceof Error) {
      return JSON.stringify(
        {
          name: metadata.name,
          message: metadata.message,
          stack: metadata.stack,
        },
        null,
        0,
      );
    }

    return JSON.stringify(metadata);
  } catch {
    try {
      return String(metadata);
    } catch {
      return "[unserializable-metadata]";
    }
  }
}

function getIconByColor(color: LogColor): string {
  switch (color) {
    case "VERDE":
      return "🟢";
    case "AMARILLO":
      return "🟡";
    case "NARANJA":
      return "🟠";
    case "AZUL":
      return "🔵";
    case "BLANCO":
      return "⚪️";
    case "ROJO":
      return "🔴";
    default:
      return "•";
  }
}

export const structuredLog = (entry: Omit<SystemLogEntry, "timestamp" | "timestamp_str">): void => {
  const nowTs = dayjs();
  const timestamp = nowTs.valueOf();
  const timestamp_str = nowTs.format("YYYY-MM-DDTHH:mm:ss.SSSZ");

  const fullEntry: SystemLogEntry = {
    ...entry,
    timestamp,
    timestamp_str,
  };

  if (__DEV__) {
    const icon = getIconByColor(entry.color);
    const consoleMsg = `[${timestamp_str}] ${icon} [${entry.categoria}] ${entry.mensaje}`;
    const c = console;
    if (entry.severidad === "ERROR") {
      c["error"](consoleMsg, entry.metadata ?? "");
    } else if (entry.severidad === "WARN") {
      c["warn"](consoleMsg, entry.metadata ?? "");
    } else {
      c["log"](consoleMsg, entry.metadata ?? "");
    }
  }

  if (dbInstance) {
    void saveSystemLogToDb(fullEntry);
  } else {
    logQueue.push(fullEntry);
  }

  emitFeedbackFromLog(entry.severidad, entry.categoria, entry.mensaje);
};

export const log = (
  color: LogColor,
  categoria: LogCategory,
  severidad: LogSeverity,
  mensaje: string,
  metadata?: unknown,
  session_id?: number | null,
  event_type?: string | null,
  trigger_source?: string | null,
  reason?: string | null,
  from_state?: string | null,
  to_state?: string | null,
  sync_status?: "PENDING" | "SYNCED" | "FAILED",
): void => {
  structuredLog({
    color,
    categoria,
    severidad,
    mensaje,
    metadata: safeSerializeMetadata(metadata),
    session_id,
    event_type,
    trigger_source,
    reason,
    from_state,
    to_state,
    sync_status,
  });
};
