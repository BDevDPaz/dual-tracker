/**
 * Inventario de tareas OS (Propuesta Técnica §5.7 y §7.2).
 */
export const TASK_INVENTORY = [
  "GEOFENCE",
  "BREADCRUMB",
  "SESSION_WATCHDOG",
  "EXIT_DECISION_TIMER",
  "DAILY_REMINDER",
  "INTEGRITY_SWEEP",
  "PAYROLL_EXPORT",
] as const;

/** Worker único de expo-background-task que ejecuta watchdog, sweep y export. */
export const BACKGROUND_WORKER_TASK_NAME = "DUALTRACKER_BACKGROUND_WORKER";

/** Intervalo mínimo del worker (min). Propuesta §7.2: 15–30 min. */
export const BACKGROUND_WORKER_MIN_INTERVAL_MIN = 15;

/** Tope de jornada abierta antes de proponer AUTO-CLOSE (Propuesta §4.1: 12 h). */
export const MAX_OPEN_SESSION_MS = 12 * 60 * 60 * 1000;
