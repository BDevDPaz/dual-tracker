/**
 * Textos legales de producto (DualDisclosureService). Versionados: cambiar
 * cualquier bloque exige subir DISCLOSURE_VERSION para volver a pedir aceptación.
 *
 * TODO(legal): revisión por asesoría antes de publicar. El contenido sigue los
 * bloques exigidos en la Propuesta de Producto §5.4 y la Técnica §5.11.
 * TODO(legal): el texto de B2 (Solicitud 7: resumen de tres bloques, bloques
 * «Llegada al sitio» y «Cierre a las 12 horas», almuerzo/pausa precisado y
 * limpieza de jerga) NO está aprobado para publicarse: queda pendiente de
 * revisión por la asesoría legal. Cada frase sale de lo que hace el código
 * (citas en el PR de B2); eso no le da validez legal.
 */
export const DISCLOSURE_VERSION = "2026-11-v4";

export interface LegalBlock {
  key: string;
  title: string;
  body: string;
}

export interface LegalContent {
  version: string;
  title: string;
  blocks: LegalBlock[];
  acceptLabel: string;
}

/**
 * Aviso: `summary` son los tres bloques cortos de la pantalla del alta;
 * `blocks` es el aviso completo («Leer aviso completo» → legal/disclosure).
 */
export interface DisclosureLegalContent extends LegalContent {
  summary: LegalBlock[];
}

// TODO(legal): texto de B2 pendiente de revisión por la asesoría legal antes de publicar.
const DISCLOSURE: Record<"es" | "en", DisclosureLegalContent> = {
  es: {
    version: DISCLOSURE_VERSION,
    title: "Qué registra esta aplicación",
    acceptLabel: "He leído y acepto",
    summary: [
      {
        key: "what",
        title: "¿Qué registramos?",
        body: "Tu ubicación precisa y la hora mientras tienes una jornada abierta, incluso si la app está cerrada o no la estás usando. Sin jornada abierta no registramos tu ubicación. La única excepción es cuando pides fijar o mover el punto de un sitio desde la pantalla del destino: en ese momento la app lee tu ubicación, aunque no tengas jornada abierta. Durante el almuerzo o una pausa no se guardan puntos de rastro, aunque el servicio de ubicación siga activo.",
      },
      {
        key: "why",
        title: "¿Para qué?",
        body: "Para confirmar tus horas en el sitio de trabajo, registrar tus entradas y salidas, avisarte si sales sin cerrar la jornada y, si tu empresa activa el modo de rastro, guardar puntos de ubicación durante la jornada. Se usa para la nómina, no para vigilar tu vida personal. Tú y tu empleador ven el mismo registro.",
      },
      {
        key: "howLong",
        title: "¿Cuánto tiempo se guarda?",
        body: "Los datos se guardan en tu teléfono. Si tu empresa activa el portal del empleador, el expediente se envía por HTTPS al portal para que tu empleador lo vea. Los puntos de rastro se borran cuando el periodo de nómina ya se exportó y pasaron 90 días desde el fin de ese periodo (la empresa puede fijar otro plazo). Las entradas y salidas se conservan como registro de nómina.",
      },
    ],
    blocks: [
      {
        key: "perimeter",
        title: "Perímetro del sitio",
        body: "Mientras tu jornada está abierta, Dual Tracker detecta cuándo entras o sales de la zona del sitio de trabajo y guarda la hora, la posición y la precisión de cada evento.",
      },
      {
        key: "breadcrumb",
        title: "Rastro durante la jornada",
        body: "Solo si la empresa activa el modo de rastro, se guardan puntos de ubicación mientras estás en el sitio o en traslado. Nunca con la jornada cerrada ni antes de iniciarla: no hay rastreo 24/7.",
      },
      {
        key: "lunch",
        title: "Almuerzo y pausas",
        body: "Durante el almuerzo o una pausa no se guardan puntos de rastro, aunque el servicio de ubicación siga activo. Si entras o sales de la zona del sitio, eso sí queda anotado, como en el resto de la jornada.",
      },
      {
        key: "retention",
        title: "Retención",
        body: "Los puntos de rastro se borran solo cuando el periodo de nómina que los contiene ya se exportó y, además, pasó el plazo que fije la empresa (por defecto 90 días) desde el fin de ese periodo. Las dos condiciones. Un periodo sin exportar no se borra. Los eventos de entrada y salida forman parte del expediente de nómina. Las entradas y salidas, los asientos y el expediente sellado se conservan como registro de nómina y no se borran.",
      },
      {
        key: "recipients",
        title: "Destinatarios del expediente",
        body: "El mismo expediente lo ven tú (comprobante) y tu empleador (expediente con integridad y rastro). Ambos pueden comparar el mismo código de verificación. No vendemos tu ubicación ni la compartimos con fines publicitarios. Tu empleador lo recibe cuando compartes o exportas el expediente, o por el portal del empleador si tu empresa lo activa.",
      },
      {
        key: "purpose",
        title: "Finalidad",
        body: "Nómina y auditoría. No vigilancia continua de tu vida personal.",
      },
      {
        key: "arrival",
        title: "Llegada al sitio",
        body: "La jornada no se abre sola: la abres tú, en la app o con el botón del recordatorio diario. Si ya la abriste y llegas al sitio con la app cerrada, la app puede registrar tu llegada y te avisa cuando lo hace.",
      },
      {
        key: "autoClose",
        title: "Cierre a las 12 horas",
        body: "Si olvidas cerrar tu jornada, se cierra automáticamente al pasar 12 horas y te avisamos para que revises tus horas. No se cierra así si ampliaste la jornada o si ya está en revisión por posible abandono.",
      },
      {
        key: "control",
        title: "Tu control",
        body: "Puedes retirar tu consentimiento o repetir el alta desde este aviso o desde Ajustes. Al retirarlo no podrás usar la app hasta volver a aceptar el aviso y completar el alta; tus jornadas, expedientes y ajustes se conservan. Si no aceptas este aviso, no puedes completar el alta. Para retirar el consentimiento o repetir el alta, primero cierra la jornada si tienes una abierta.",
      },
    ],
  },
  en: {
    version: DISCLOSURE_VERSION,
    title: "What this app records",
    acceptLabel: "I have read and accept",
    summary: [
      {
        key: "what",
        title: "What do we record?",
        body: "Your precise location and the time while you have an open shift, even if the app is closed or you are not using it. Without an open shift we do not record your location. The only exception is when you ask to set or move a site point from the site screen: at that moment the app reads your location, even without an open shift. During lunch or a pause no trail points are stored, even though the location service keeps running.",
      },
      {
        key: "why",
        title: "What for?",
        body: "To confirm your hours at the work site, record your entries and exits, alert you if you leave without closing the shift and, if your company enables trail mode, store location points during the shift. It is used for payroll, not to monitor your personal life. You and your employer see the same record.",
      },
      {
        key: "howLong",
        title: "How long is it kept?",
        body: "The data is stored on your phone. If your company activates the employer portal, the record is sent over HTTPS to the portal so your employer can see it. Trail points are deleted once the payroll period has been exported and 90 days have passed since that period ended (your company can set a different period). Entries and exits are kept as the payroll record.",
      },
    ],
    blocks: [
      {
        key: "perimeter",
        title: "Site perimeter",
        body: "While your shift is open, Dual Tracker detects when you enter or leave the work site zone and stores the time, position and accuracy of each event.",
      },
      {
        key: "breadcrumb",
        title: "Shift trail",
        body: "Only if your employer enables trail mode, location points are stored while you are on site or traveling. Never before starting or after closing the shift: there is no 24/7 tracking.",
      },
      {
        key: "lunch",
        title: "Lunch and pauses",
        body: "During lunch or a pause no trail points are stored, even though the location service keeps running. If you enter or leave the site zone, that is still recorded, as during the rest of the shift.",
      },
      {
        key: "retention",
        title: "Retention",
        body: "Trail points are deleted only after the payroll period that contains them has been exported and the company retention period (90 days by default) has also passed since that period ended. Both conditions. An unexported period is never deleted. Entry and exit events are part of the payroll record. Entries and exits, ledger entries and the sealed pack are kept as the payroll record and are not deleted.",
      },
      {
        key: "recipients",
        title: "Who receives the record",
        body: "You (receipt) and your employer (dossier with integrity and trail) see the same record and can compare the same verification code. We do not sell your location or share it for advertising. Your employer receives it when you share or export the record, or through the employer portal if your company activates it.",
      },
      {
        key: "purpose",
        title: "Purpose",
        body: "Payroll and audit. Not continuous monitoring of your personal life.",
      },
      {
        key: "arrival",
        title: "Arriving at the site",
        body: "The shift does not open by itself: you open it, in the app or with the daily reminder button. If you already opened it and arrive at the site with the app closed, the app can record your arrival and lets you know when it does.",
      },
      {
        key: "autoClose",
        title: "Closing at 12 hours",
        body: "If you forget to close your shift, it closes automatically after 12 hours and we let you know so you can review your hours. It is not closed this way if you extended the shift or if it is already under review for possible abandonment.",
      },
      {
        key: "control",
        title: "Your control",
        body: "You can withdraw your consent or repeat setup from this notice or from Settings. If you withdraw it, you won't be able to use the app until you accept the notice again and finish setup; your shifts, evidence packs and settings are kept. If you don't accept this notice, you can't finish setup. To withdraw consent or repeat setup, first close your shift if you have one open.",
      },
    ],
  },
};

export function getDisclosureContent(language: "es" | "en"): DisclosureLegalContent {
  return DISCLOSURE[language] ?? DISCLOSURE.es;
}

export function getRetentionContent(language: "es" | "en", retentionDays: number): LegalContent {
  if (language === "en") {
    return {
      version: DISCLOSURE_VERSION,
      title: "Retention policy",
      acceptLabel: "",
      blocks: [
        { key: "trail", title: "Trail points", body: `Purged only after the payroll period that contains them has been exported and ${retentionDays} days have passed since that period ended. Both conditions. An unexported period is never purged.` },
        { key: "evidence", title: "Payroll evidence", body: "Entry/exit events, ledger entries and sealed packs are kept as payroll evidence and are not purged with the trail." },
      ],
    };
  }
  return {
    version: DISCLOSURE_VERSION,
    title: "Política de retención",
    acceptLabel: "",
    blocks: [
      { key: "trail", title: "Miga de pan", body: `Se expurga solo si el periodo de nómina que la contiene ya se exportó y, además, pasaron ${retentionDays} días desde el fin de ese periodo. Las dos condiciones. Un periodo sin exportar no se borra.` },
      { key: "evidence", title: "Evidencia de nómina", body: "Los eventos de entrada/salida, los asientos del ledger y los expedientes sellados se conservan como evidencia de nómina y no se expurgan con el rastro." },
    ],
  };
}
