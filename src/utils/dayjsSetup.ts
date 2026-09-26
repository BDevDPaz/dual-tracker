// --- src/utils/dayjsSetup.ts --- (portado de GEOTrack)
import dayjs from "dayjs";
import "dayjs/locale/es";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isBetween from "dayjs/plugin/isBetween";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import duration from "dayjs/plugin/duration";

// Extender dayjs con los plugins necesarios para auditoría y nómina
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);
dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.extend(duration);

// Idioma por defecto para la UI
dayjs.locale("es");

/**
 * Zona horaria corporativa (sede física) para estandarizar reportes,
 * independiente de la ubicación del dispositivo. Heredado de GEOTrack.
 * TODO: mover a CompanyPolicy.timezone cuando exista el campo en la zona admin.
 */
export const CORPORATE_TIMEZONE = "America/Los_Angeles";
dayjs.tz.setDefault(CORPORATE_TIMEZONE);

/**
 * IMPORTANTE: este módulo solo debe usarse para FORMATEAR o hacer aritmética
 * de calendario sobre timestamps ya obtenidos. El "ahora" canónico lo entrega
 * exclusivamente TimeAuthorityService (Propuesta Técnica §5.1).
 */
export default dayjs;
