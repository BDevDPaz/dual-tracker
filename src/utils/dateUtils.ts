// --- src/utils/dateUtils.ts ---
import dayjs from "./dayjsSetup";

/**
 * Formatea un timestamp a hora local corporativa (Ej: 08:30 AM)
 */
export const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "--:--";
  // ✅ FIX: Eliminado .tz() forzado que causaba UTC leakage en Hermes.
  // dayjs ya hereda la zona de Los Ángeles directamente desde dayjsSetup.ts
  return dayjs.tz(timestamp).format("hh:mm A");
};

/**
 * Formatea un timestamp a fecha legible (Ej: dom., 31 may. 2026)
 */
export const formatDate = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "---";
  // ✅ FIX: Eliminado .tz() forzado
  return dayjs.tz(timestamp).format("ddd, D MMM YYYY");
};

/**
 * Convierte milisegundos a una cadena de duración (Ej: 8h 30m)
 * Utiliza el plugin de duración de dayjs para mayor precisión.
 */
export const formatDuration = (ms: number): string => {
  if (!ms || ms < 0) return "0h 0m";

  const d = dayjs.duration(ms);
  const h = Math.floor(d.asHours());
  const m = d.minutes();

  return `${h}h ${m}m`;
};
