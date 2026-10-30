import { TraceMode } from "../core/contracts";

/**
 * ============================================================================
 * DualDisclosureService — Propuesta 5.11 (nuevo, legal de producto)
 * ----------------------------------------------------------------------------
 * Consentimiento y transparencia. Dual Tracker registra ubicación laboral
 * para producir nómina auditable y evidencia de traslado, NUNCA como
 * vigilancia continua de la vida personal del trabajador (sección 10: "Rastreo
 * 24/7 fuera de jornada" está explícitamente prohibido).
 *
 * Regla dura: "Sin aceptación, no se inicia ESPERANDO" (sección 5.11). Este
 * servicio es la única fuente de verdad sobre si el descargo fue aceptado y
 * sobre qué modo de rastro debe mostrarse en la UI.
 * ============================================================================
 */

export interface DisclosureText {
  title: string;
  body: string;
}

const DISCLOSURE_ES: DisclosureText = {
  title: "Aviso de rastreo laboral — Dual Tracker",
  body:
    "Dual Tracker registra tu ubicación únicamente mientras tu jornada está " +
    "activa: desde que confirmas el inicio de trabajo hasta que la cierras, " +
    "incluyendo pausas de almuerzo y traslados entre sitios declarados. " +
    "Fuera de esa ventana, la app no graba tu posición.\n\n" +
    "¿Qué se graba? Entradas y salidas de la zona del sitio de trabajo " +
    "(geocerca), y — si aceptas ubicación en segundo plano — puntos de " +
    "trayectoria con precisión aproximada durante los traslados entre " +
    "sitios. No se registra tu ubicación cuando la jornada está cerrada o " +
    "no ha iniciado.\n\n" +
    "¿Para qué se usa? Para calcular tus horas regulares, horas extra y " +
    "traslados remunerados de forma verificable (nómina), y para poder " +
    "auditar y explicar cualquier cierre automático o edición manual de tu " +
    "horario (auditoría). No se usa para vigilar tu vida personal ni tu " +
    "ubicación fuera del horario laboral.\n\n" +
    "¿Por cuánto tiempo se conserva? Los puntos de trayectoria detallados " +
    "se conservan por un periodo limitado y configurable (por ejemplo, 90 " +
    "días o hasta que exportes el periodo de nómina correspondiente); el " +
    "resumen de horas y el libro de auditoría (ledger) se conservan como " +
    "respaldo de nómina.\n\n" +
    "Puedes revisar en todo momento el modo de rastro activo desde la " +
    'pantalla principal: "Rastro activo", "Solo geocerca" o "Sin ' +
    'ubicación". Sin tu aceptación explícita de este aviso, la app no ' +
    "iniciará el estado de espera de jornada.",
};

const DISCLOSURE_EN: DisclosureText = {
  title: "Work Location Tracking Notice — Dual Tracker",
  body:
    "Dual Tracker records your location only while your work shift is " +
    "active: from the moment you confirm you started work until you close " +
    "it, including lunch breaks and declared transit between sites. " +
    "Outside that window, the app does not record your position.\n\n" +
    "What is recorded? Entries and exits from your worksite perimeter " +
    "(geofence), and — if you grant background location — trajectory " +
    "points with approximate accuracy while you are in transit between " +
    "sites. Your location is never recorded while your shift is closed or " +
    "has not started.\n\n" +
    "What is it used for? To calculate your regular hours, overtime, and " +
    "paid transit in a verifiable way (payroll), and to audit and explain " +
    "any automatic shift closure or manual schedule edit (audit trail). It " +
    "is NOT used to monitor your personal life or your location outside " +
    "working hours — this is not 24/7 surveillance.\n\n" +
    "How long is it kept? Detailed trajectory points are kept for a " +
    "limited, configurable period (for example, 90 days or until you " +
    "export the corresponding payroll period); the hours summary and audit " +
    "ledger are retained as payroll records.\n\n" +
    "You can check the active tracking mode at any time from the main " +
    'screen: "Active trace", "Geofence only", or "No location". ' +
    "Without your explicit acceptance of this notice, the app will not " +
    "start the waiting-for-shift state.",
};

const RETENTION_ES: DisclosureText = {
  title: "Política de retención de datos",
  body:
    "La miga de pan detallada (puntos de trayectoria durante ACTIVA/TRASLADO) " +
    "se conserva por 90 días desde su captura, o hasta que exportes el " +
    "expediente del periodo de nómina que la contiene, lo que ocurra " +
    "primero. Pasado ese plazo, TraceRecorderService expurga los puntos " +
    "crudos; el resumen de horas y el libro de auditoría (ledger) NO se " +
    "borran, porque son el respaldo legal de la nómina ya pagada.\n\n" +
    "Los hechos de perímetro (entradas y salidas de geocerca) se conservan " +
    "junto con la sesión a la que pertenecen, con la misma política que el " +
    "resto del expediente de esa jornada.\n\n" +
    "Nunca se registra ubicación fuera de una jornada abierta: no hay " +
    "rastreo 24/7 en Dual Tracker.",
};

const RETENTION_EN: DisclosureText = {
  title: "Data Retention Policy",
  body:
    "Detailed breadcrumb trail points (captured during ACTIVE/TRANSIT) are " +
    "kept for 90 days from capture, or until you export the payroll period " +
    "record that contains them, whichever happens first. After that, " +
    "TraceRecorderService purges the raw points; the hours summary and the " +
    "audit ledger are NOT deleted, since they are the legal backing for " +
    "payroll already paid.\n\n" +
    "Perimeter facts (geofence enter/exit) are kept together with the " +
    "session they belong to, under the same policy as the rest of that " +
    "shift's record.\n\n" +
    "Location is never recorded outside an open shift: there is no 24/7 " +
    "tracking in Dual Tracker.",
};

class DualDisclosureService {
  /** Texto real y específico del descargo, en el idioma solicitado. */
  getDisclosureText(locale: "es" | "en"): DisclosureText {
    return locale === "en" ? DISCLOSURE_EN : DISCLOSURE_ES;
  }

  /** Texto de la política de retención (app/legal/retention.tsx). */
  getRetentionText(locale: "es" | "en"): DisclosureText {
    return locale === "en" ? RETENTION_EN : RETENTION_ES;
  }

  /**
   * Deriva el modo de rastro visible en UI a partir del consentimiento y de
   * los permisos reales del sistema operativo (no de lo que la UI recuerde).
   *
   *  - Sin aceptación del descargo, o sin ubicación en primer plano:
   *    "SIN_UBICACION" (fail-secure: no hay garantía de que se esté
   *    registrando nada de forma fiable).
   *  - Con aceptación y ubicación en primer plano, pero sin segundo plano:
   *    "SOLO_GEOCERCA" (solo se pueden detectar entradas/salidas mientras la
   *    app está abierta).
   *  - Con aceptación y ambos permisos: "RASTRO_ACTIVO" (miga de pan de
   *    traslado disponible).
   */
  getTraceMode(input: {
    disclaimerAccepted: boolean;
    hasBackgroundLocation: boolean;
    hasForegroundLocation: boolean;
  }): TraceMode {
    if (!input.disclaimerAccepted || !input.hasForegroundLocation) {
      return "SIN_UBICACION";
    }

    if (!input.hasBackgroundLocation) {
      return "SOLO_GEOCERCA";
    }

    return "RASTRO_ACTIVO";
  }

  /**
   * "Sin aceptación, no se inicia ESPERANDO." — puerta de entrada obligatoria
   * antes de que SessionEngine transicione a un estado de espera de jornada.
   */
  canStartWaitingState(disclaimerAccepted: boolean): boolean {
    return disclaimerAccepted === true;
  }
}

export const dualDisclosureService = new DualDisclosureService();
