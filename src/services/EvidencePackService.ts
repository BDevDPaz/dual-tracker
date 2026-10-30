import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { EvidencePack, LedgerEntry, PayrollStatement } from "../core/contracts";
import { reportService } from "./ReportService";
import { persistenceService } from "./PersistenceService";

/**
 * ============================================================================
 * EvidencePackService — Propuesta 5.10 (nuevo, garantía dual)
 * ----------------------------------------------------------------------------
 * Empaqueta el periodo de nómina en un expediente reproducible para ambas
 * partes: `PayrollStatement`, ids de asientos del ledger, un resumen de
 * traza (nunca los puntos crudos, ver TraceRecorderService/retención) y un
 * manifiesto SHA-256 que empleado y empleador pueden comparar bit a bit.
 * ============================================================================
 */

export interface BuildPackInput {
  statement: PayrollStatement;
  ledgerEntries: LedgerEntry[];
  traceSummary: EvidencePack["traceSummary"];
}

function generatePackId(statement: PayrollStatement): string {
  // Determinista por periodo + política. Antes era `pack_${statement.id}`
  // y statement.id incluía Date.now() + random, lo que creaba duplicados
  // en cada rebuild en vez de sellar una sola vez por periodo.
  return `pack_${statement.policyId}_${statement.periodStart}_${statement.periodEnd}`;
}

/**
 * Manifiesto canónico: statement completo + solo ids de ledger (no el
 * payload crudo, que ya vive hasheado dentro de cada LedgerEntry) +
 * traceSummary + policyId. Determinista para que dos generaciones del mismo
 * contenido produzcan el mismo `manifestSha256`.
 *
 * Excluye `packHash` y `generatedAtMs` del statement, igual que
 * PayrollEngineService.canonicalStatementJson, porque son metadatos de
 * generación, no contenido de nómina. Sin esto, Date.now() haría que el
 * hash cambiara en cada rebuild.
 */
function canonicalManifestJson(input: {
  statement: PayrollStatement;
  ledgerEntryIds: string[];
  traceSummary: EvidencePack["traceSummary"];
  policyId: string;
}): string {
  const { packHash, generatedAtMs, ...statementWithoutMeta } =
    input.statement as PayrollStatement & {
      packHash: string;
      generatedAtMs: number;
    };

  const sortedLines = [...(statementWithoutMeta.lines ?? [])].sort((a, b) => {
    const keyA = `${a.kind}|${a.sessionId ?? ""}|${a.minutes}|${a.rate}|${a.amount}|${a.description}`;
    const keyB = `${b.kind}|${b.sessionId ?? ""}|${b.minutes}|${b.rate}|${b.amount}|${b.description}`;
    return keyA.localeCompare(keyB);
  });

  return JSON.stringify({
    statement: {
      ...statementWithoutMeta,
      lines: sortedLines,
    },
    ledgerEntryIds: [...input.ledgerEntryIds].sort(),
    traceSummary: input.traceSummary,
    policyId: input.policyId,
  });
}

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

function safePackId(packId: string): string {
  return packId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

class EvidencePackService {
  /**
   * Construye el EvidencePack a partir de un statement ya cerrado y los
   * asientos de ledger correspondientes. No recalcula nómina ni integridad:
   * solo empaqueta y firma con SHA-256.
   */
  async buildPack(input: BuildPackInput): Promise<EvidencePack> {
    const { statement, ledgerEntries, traceSummary } = input;
    const ledgerEntryIds = ledgerEntries.map((entry) => entry.id);

    const manifestSha256 = await sha256(
      canonicalManifestJson({
        statement,
        ledgerEntryIds,
        traceSummary,
        policyId: statement.policyId,
      }),
    );

    const pack: EvidencePack = {
      id: generatePackId(statement),
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      statement,
      ledgerEntryIds,
      traceSummary,
      manifestSha256,
      policyId: statement.policyId,
      generatedAtMs: Date.now(),
    };

    // Sellado: persiste una sola vez por id determinista. report/pack/[packId].tsx
    // lo lee más tarde vía getPack/listPacks -- un pack sellado nunca se reescribe,
    // un rebuild del mismo periodo produce el mismo id y el mismo manifestSha256.
    await persistenceService.savePack(pack);

    return pack;
  }

  /** Lee un pack ya sellado por id, o null si nunca se construyó. */
  async getPack(packId: string): Promise<EvidencePack | null> {
    return persistenceService.getPack(packId);
  }

  /** Lista todos los packs sellados, más recientes primero. */
  async listPacks(): Promise<EvidencePack[]> {
    return persistenceService.listPacks();
  }

  /**
   * Exporta el paquete ya construido. Para 'pdf' delega el render en
   * ReportService (expediente del empleador, que ya incluye el packHash del
   * statement). Para 'json' escribe un archivo con el manifiesto completo
   * (statement + ids de ledger + hash) que sirve de "firma" comparable entre
   * empleado y empleador.
   *
   * Nota: este método necesita los LedgerEntry completos para renderizar el
   * PDF del expediente; como EvidencePack solo guarda ids (por diseño, para
   * no duplicar el payload crudo del ledger), 'pdf' requiere que el llamador
   * ya haya resuelto esos LedgerEntry y los pase junto al pack a través del
   * parámetro opcional `ledgerEntries`.
   */
  async exportPack(
    pack: EvidencePack,
    format: "pdf" | "json",
    ledgerEntries: LedgerEntry[] = [],
  ): Promise<string> {
    if (format === "pdf") {
      return reportService.renderEmployerDossier(pack.statement, ledgerEntries);
    }

    const jsonPayload = {
      id: pack.id,
      periodStart: pack.periodStart,
      periodEnd: pack.periodEnd,
      statement: pack.statement,
      ledgerEntryIds: pack.ledgerEntryIds,
      traceSummary: pack.traceSummary,
      manifestSha256: pack.manifestSha256,
      policyId: pack.policyId,
      generatedAtMs: pack.generatedAtMs,
    };

    const filename = `dualtracker_${safePackId(pack.id)}_manifest.json`;
    const destinationUri = `${FileSystem.cacheDirectory ?? ""}${filename}`;

    await FileSystem.writeAsStringAsync(destinationUri, JSON.stringify(jsonPayload, null, 2));

    return destinationUri;
  }
}

export const evidencePackService = new EvidencePackService();
