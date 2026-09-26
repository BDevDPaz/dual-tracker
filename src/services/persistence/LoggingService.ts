/**
 * LoggingService — Persistencia (Propuesta Técnica §4.9)
 * ============================================================================
 * Fusiona logger.ts, loggingAdapter y audit_logs de GEOTrack.
 * Dos streams explícitos:
 *  - SYSTEM: diagnóstico operativo (tabla system_logs).
 *  - AUDIT: hechos con efecto de nómina o integridad (tabla audit_logs).
 *    Ojo: el AUDIT stream es operativo; la evidencia legal es el
 *    IntegrityLedger (append-only con hash encadenado).
 * Cola de arranque si SQLite aún no está lista (portado de GEOTrack).
 */
import type * as SQLite from "expo-sqlite";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { serializeError } from "../../utils/serializeError";

export type LogColor = "VERDE" | "AMARILLO" | "NARANJA" | "AZUL" | "BLANCO" | "ROJO";
export type LogSeverity = "INFO" | "WARN" | "ERROR" | "DEBUG" | "EVENT";

export interface SystemLogEntry {
  color: LogColor;
  category: string;
  severity: LogSeverity;
  message: string;
  metadata?: unknown;
  sessionId?: number | null;
  eventType?: string | null;
  triggerSource?: string | null;
  reason?: string | null;
  fromState?: string | null;
  toState?: string | null;
}

export interface AuditLogEntry {
  sessionId: number | null;
  actionType: string;
  details: string;
}

/** Acciones de auditoría heredadas de GEOTrack. */
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

type QueuedSystem = SystemLogEntry & { timestamp: number; timestampStr: string };
type QueuedAudit = AuditLogEntry & { timestamp: number };

const systemQueue: QueuedSystem[] = [];
const auditQueue: QueuedAudit[] = [];
let db: SQLite.SQLiteDatabase | null = null;
let criticalListener: ((entry: SystemLogEntry) => void) | null = null;

const ICONS: Record<LogColor, string> = {
  VERDE: "🟢",
  AMARILLO: "🟡",
  NARANJA: "🟠",
  AZUL: "🔵",
  BLANCO: "⚪️",
  ROJO: "🔴",
};

function safeMetadata(metadata: unknown): string | null {
  if (metadata === undefined) return null;
  return serializeError(metadata);
}

async function writeSystem(entry: QueuedSystem): Promise<void> {
  if (!db) return;
  try {
    await db.runAsync(
      `INSERT INTO system_logs (
        timestamp, timestamp_str, color, categoria, severidad, mensaje, metadata,
        session_id, event_type, trigger_source, reason, from_state, to_state, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        entry.timestamp,
        entry.timestampStr,
        entry.color,
        entry.category,
        entry.severity,
        entry.message,
        safeMetadata(entry.metadata),
        entry.sessionId ?? null,
        entry.eventType ?? null,
        entry.triggerSource ?? null,
        entry.reason ?? null,
        entry.fromState ?? null,
        entry.toState ?? null,
      ],
    );
  } catch (e) {
    if (__DEV__) console.error("❌ LoggingService: fallo guardando system_log", e);
  }
}

async function writeAudit(entry: QueuedAudit): Promise<void> {
  if (!db) return;
  try {
    await db.runAsync(
      `INSERT INTO audit_logs (session_id, action_type, details, timestamp) VALUES (?, ?, ?, ?)`,
      [entry.sessionId, entry.actionType, entry.details, entry.timestamp],
    );
  } catch (e) {
    if (__DEV__) console.error("❌ LoggingService: fallo guardando audit_log", e);
  }
}

export const LoggingService = {
  /** Lo llama PersistenceService.init() cuando SQLite está lista; vacía la cola de arranque. */
  async attachDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
    db = database;
    while (systemQueue.length) {
      const e = systemQueue.shift();
      if (e) await writeSystem(e);
    }
    while (auditQueue.length) {
      const e = auditQueue.shift();
      if (e) await writeAudit(e);
    }
  },

  /** Listener para errores críticos (FeedbackService lo registra en boot). */
  onCritical(listener: ((entry: SystemLogEntry) => void) | null): void {
    criticalListener = listener;
  },

  /** Stream SYSTEM. */
  system(entry: SystemLogEntry): void {
    const timestamp = TimeAuthorityService.now();
    const full: QueuedSystem = { ...entry, timestamp, timestampStr: TimeAuthorityService.nowIso() };

    if (__DEV__) {
      const msg = `[${full.timestampStr}] ${ICONS[entry.color]} [${entry.category}] ${entry.message}`;
      const meta = entry.metadata === undefined ? "" : entry.metadata;
      if (entry.severity === "ERROR") console.error(msg, meta);
      else if (entry.severity === "WARN") console.warn(msg, meta);
      else console.log(msg, meta);
    }

    if (db) void writeSystem(full);
    else systemQueue.push(full);

    if (entry.severity === "ERROR" && entry.category === "ERROR_CRITICO") {
      try {
        criticalListener?.(entry);
      } catch {
        // el listener nunca debe romper el logging
      }
    }
  },

  /** Stream AUDIT. */
  async audit(entry: AuditLogEntry): Promise<void> {
    const full: QueuedAudit = { ...entry, timestamp: TimeAuthorityService.now() };
    if (db) await writeAudit(full);
    else auditQueue.push(full);
  },

  /** Atajo compatible con la firma `log(color, categoria, severidad, mensaje, metadata)` de GEOTrack. */
  log(color: LogColor, category: string, severity: LogSeverity, message: string, metadata?: unknown): void {
    LoggingService.system({ color, category, severity, message, metadata });
  },
};
