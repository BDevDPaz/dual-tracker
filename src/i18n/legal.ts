/**
 * Textos legales de producto (DualDisclosureService). Versionados: cambiar
 * cualquier bloque exige subir DISCLOSURE_VERSION para volver a pedir aceptación.
 *
 * TODO(legal): revisión por asesoría antes de publicar. El contenido sigue los
 * bloques exigidos en la Propuesta de Producto §5.4 y la Técnica §5.11.
 */
export const DISCLOSURE_VERSION = "2026-10-v2";

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

const DISCLOSURE: Record<"es" | "en", LegalContent> = {
  es: {
    version: DISCLOSURE_VERSION,
    title: "Qué registra esta aplicación",
    acceptLabel: "He leído y acepto",
    blocks: [
      {
        key: "perimeter",
        title: "Perímetro del sitio",
        body: "Mientras tu jornada está abierta, Dual Tracker detecta cuándo entras o sales de la zona del sitio de trabajo (geocerca) y guarda la hora y la precisión de cada evento.",
      },
      {
        key: "breadcrumb",
        title: "Rastro durante la jornada",
        body: "Solo si la empresa activa el modo de rastro, se guardan puntos de ubicación mientras la jornada está ACTIVA o en TRASLADO. Nunca con la jornada cerrada ni antes de iniciarla: no hay rastreo 24/7.",
      },
      {
        key: "lunch",
        title: "Almuerzo",
        body: "Durante el almuerzo o una pausa no se registra rastro: tu destino personal no se guarda.",
      },
      {
        key: "retention",
        title: "Retención",
        body: "Los puntos de rastro se expurgan solo cuando el periodo de nómina que los contiene ya se exportó y, además, pasó el plazo que fije la empresa (por defecto 90 días) desde el fin de ese periodo. Las dos condiciones. Un periodo sin exportar no se borra. Los eventos de entrada y salida forman parte del expediente de nómina.",
      },
      {
        key: "recipients",
        title: "Destinatarios del expediente",
        body: "El mismo expediente lo ven tú (comprobante) y tu empleador (expediente con integridad y rastro). Ambos pueden comparar el mismo código de verificación (hash).",
      },
      {
        key: "purpose",
        title: "Finalidad",
        body: "Nómina y auditoría. No vigilancia continua de tu vida personal.",
      },
    ],
  },
  en: {
    version: DISCLOSURE_VERSION,
    title: "What this app records",
    acceptLabel: "I have read and accept",
    blocks: [
      {
        key: "perimeter",
        title: "Site perimeter",
        body: "While your shift is open, Dual Tracker detects when you enter or leave the work site zone (geofence) and stores the time and accuracy of each event.",
      },
      {
        key: "breadcrumb",
        title: "Shift trail",
        body: "Only if your employer enables trail mode, location points are stored while the shift is on site or traveling. Never before starting or after closing the shift: there is no 24/7 tracking.",
      },
      {
        key: "lunch",
        title: "Lunch",
        body: "No trail is recorded during lunch or a pause: your personal destination is not stored.",
      },
      {
        key: "retention",
        title: "Retention",
        body: "Trail points are purged only after the payroll period that contains them has been exported and the company retention period (90 days by default) has also passed since that period ended. Both conditions. An unexported period is never deleted. Entry and exit events are part of the payroll record.",
      },
      {
        key: "recipients",
        title: "Who receives the record",
        body: "You (receipt) and your employer (dossier with integrity and trail) see the same record and can compare the same verification hash.",
      },
      {
        key: "purpose",
        title: "Purpose",
        body: "Payroll and audit. Not continuous monitoring of your personal life.",
      },
    ],
  },
};

export function getDisclosureContent(language: "es" | "en"): LegalContent {
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
