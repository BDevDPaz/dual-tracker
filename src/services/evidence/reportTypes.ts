/**
 * Tipos compartidos de reportes para romper el ciclo
 * reportTemplates <-> reportPremium.
 * reportTemplates importaba renderPremiumDocument (valor) de reportPremium,
 * y reportPremium importaba ForensicLedgerRow / ReportInput (tipo) de
 * reportTemplates. Ahora los dos importan los tipos de aquí.
 * No importar nada de ./reportTemplates ni de ./reportPremium en este archivo.
 */
import type {
  CompanyPolicy,
  EvidenceSummary,
  PackManifest,
  PayrollStatement,
  PersonProfile,
  SessionRecord,
  Site,
} from "../../core/contracts";
import type { PowerOffNote } from "./deviceOffGap";
import type { SiteMoveNote } from "./siteMoves";

/** Anexos que se eligen al compartir. No forman parte del sello. */
export interface ReportAnnexOptions {
  ledger?: boolean;
  enterExit?: boolean;
}

/** Fila de bitácora ya recortada: sin payloadJson, para no pintar coordenadas. */
export interface ForensicLedgerRow {
  id: number;
  sessionId: number | null;
  timestampMs: number;
  actor: string;
  intent: string;
  fromState: string | null;
  toState: string | null;
  reason: string;
  integrityClass: string | null;
  hash: string;
  prevHash: string;
  /** Texto ya traducido, sin coordenadas. El sello no lo guarda. */
  detail?: string;
}

export interface ReportInput {
  statement: PayrollStatement;
  evidence: EvidenceSummary;
  manifest: Pick<
    PackManifest,
    | "packId"
    | "packHash"
    | "sealedAtMs"
    | "certified"
    | "policyId"
    | "sealWarnings"
    | "signature"
    | "manifestVersion"
    | "documentVersion"
    | "documentTheme"
    | "documentLocale"
    | "appVersion"
    | "versionCode"
    | "gitCommit"
    | "sessionTimeZones"
  >;
  sessions: SessionRecord[];
  sites: Site[];
  profile: PersonProfile;
  company: CompanyPolicy;
  /** Solo documento v2. El sello guardado no los incluye. */
  annex?: ReportAnnexOptions;
  /** Marca de agua PRÁCTICA. El sello real no la pone. */
  practice?: boolean;
  /**
   * Copia del rango que se ve en Reportes. No es un sello: la plantilla
   * premium no pone «SELLADO» ni un código de verificación.
   */
  rangeCopy?: boolean;
  /** Semanas laborales que suma la copia. Más de una muestra el aviso semanal. */
  rangeWeekCount?: number;
  /** Asientos ya filtrados al expediente. Solo si annex.ledger. */
  ledger?: ForensicLedgerRow[];
  /**
   * Cortes de teléfono leídos del ledger al pintar. No entran en contentHash:
   * el PDF es presentación. Ausente si no hubo OS_KILL.
   */
  powerOffs?: PowerOffNote[];
  /**
   * Movimientos de sitio leídos del ledger al pintar. No entran en packHash.
   */
  siteMoves?: SiteMoveNote[];
}
