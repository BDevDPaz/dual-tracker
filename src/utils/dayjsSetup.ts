// --- src/utils/dayjsSetup.ts ---
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

// Configurar idioma por defecto para la UI
dayjs.locale("es");

// Fjar la zona horaria corporativa (Sede Física) para estandarizar los reportes
// independientemente de la ubicación actual del dispositivo del empleado.
dayjs.tz.setDefault("America/Los_Angeles");

export default dayjs;
