import dayjs from "./dayjsSetup";

/**
 * Proveedor de tiempo centralizado para asegurar consistencia en auditorías
 * y evitar fugas de zona horaria en diferentes motores JS (Hermes vs V8).
 */

/**
 * Retorna el timestamp actual en milisegundos.
 */
export const now = (): number => dayjs().valueOf();

/**
 * Retorna la fecha y hora actual en formato ISO 8601 (UTC).
 */
export const nowIso = (): string => dayjs.utc().toISOString();

/**
 * Convierte un timestamp a formato ISO 8601.
 */
export const fromTimestamp = (ts: number): string => dayjs(ts).toISOString();

/**
 * Parsea una cadena ISO o timestamp a objeto Dayjs.
 */
export const parseIso = (iso: string | number) => dayjs(iso);

/**
 * Retorna el objeto Dayjs del momento actual.
 */
export const currentDate = () => dayjs();

/**
 * Retorna solo la parte de la fecha (YYYY-MM-DD) para bookkeeping.
 */
export const todayDateString = (): string => dayjs().format("YYYY-MM-DD");

/**
 * Retorna la fecha de un timestamp dado en formato YYYY-MM-DD.
 */
export const toDateString = (ts: number): string => dayjs(ts).format("YYYY-MM-DD");
