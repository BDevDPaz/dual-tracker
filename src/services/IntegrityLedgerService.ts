import * as Crypto from "expo-crypto";
import { IntegrityClass, LedgerEntry } from "../core/contracts";
import { persistenceService } from "./PersistenceService";

/**
 * ============================================================================
 * IntegrityLedgerService — Propuesta 5.3 (nuevo, crítico)
 * ----------------------------------------------------------------------------
 * Libro de evidencia append-only. Cada intención, hecho GPS, edición manual y
 * cierre genera un asiento con hash encadenado: hash = SHA256(prevHash +
 * payload canónico). No expone ningún método de actualización o borrado: una
 * vez escrito, un LedgerEntry es inmutable (sección 5.3, "El PDF y la
 * pantalla de historial leen el ledger; no reconstruyen la historia a partir
 * del último UPDATE").
 *
 * Clases de integridad (VALID/MANUAL/AUTO/CONFLICT) no se degradan en
 * silencio: la clase "vigente" de una sesión es la del ÚLTIMO asiento del
 * ledger para ese sessionId. Una transición hacia CONFLICT solo puede
 * revertirse agregando un NUEVO asiento con un `reasonCode` explícito; nunca
 * omitiendo o borrando el asiento que produjo el CONFLICT.
 * ============================================================================
 */

const GENESIS_HASH = "GENESIS";

export type AppendLedgerEntryInput = Omit<LedgerEntry, "id" | "hash" | "prevHash">;

//export interface AppendLedgerEntryInput
//  extends Omit<LedgerEntry, "id" | "hash" | "prevHash"> {}

export interface VerifyChainResult {
  valid: boolean;
  brokenAtEntryId: string | null;
}

function generateEntryId(sessionId: number): string {
  return `ledger_${sessionId}_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

class IntegrityLedgerService {
  /**
   * Agrega un asiento nuevo al final de la cadena de una sesión. Calcula
   * `prevHash` a partir del último asiento persistido (o GENESIS_HASH si la
   * sesión no tiene asientos previos) y deriva `hash` de
   * `prevHash + payloadJson`. Este es el ÚNICO punto de escritura del
   * ledger: no existe `update`/`delete` en este servicio.
   */
  async append(entry: AppendLedgerEntryInput): Promise<LedgerEntry> {
    const existingEntries = await persistenceService.listLedgerEntriesForSession(entry.sessionId);

    const lastEntry =
      existingEntries.length > 0 ? existingEntries[existingEntries.length - 1] : null;

    const prevHash = lastEntry ? lastEntry.hash : GENESIS_HASH;
    const hash = await sha256(prevHash + entry.payloadJson);

    const fullEntry: LedgerEntry = {
      ...entry,
      id: generateEntryId(entry.sessionId),
      prevHash,
      hash,
    };

    await persistenceService.appendLedgerEntry(fullEntry);

    return fullEntry;
  }

  /**
   * Recorre la cadena persistida de una sesión desde el génesis y recalcula
   * cada hash para detectar manipulación (un asiento editado o eliminado
   * rompe la cadena en ese punto).
   */
  async verifyChain(sessionId: number): Promise<VerifyChainResult> {
    const entries = await persistenceService.listLedgerEntriesForSession(sessionId);

    let expectedPrevHash = GENESIS_HASH;

    for (const entry of entries) {
      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAtEntryId: entry.id };
      }

      const recomputedHash = await sha256(expectedPrevHash + entry.payloadJson);
      if (recomputedHash !== entry.hash) {
        return { valid: false, brokenAtEntryId: entry.id };
      }

      expectedPrevHash = entry.hash;
    }

    return { valid: true, brokenAtEntryId: null };
  }

  /**
   * Clase de integridad vigente de una sesión: la del ÚLTIMO asiento del
   * ledger, nunca un promedio ni la "mejor" clase histórica. Si no hay
   * asientos, se considera VALID por defecto (sesión sin hechos degradantes
   * registrados todavía).
   */
  async getIntegrityRollup(sessionId: number): Promise<IntegrityClass> {
    const entries = await persistenceService.listLedgerEntriesForSession(sessionId);

    if (entries.length === 0) {
      return "VALID";
    }

    return entries[entries.length - 1].integrityClass;
  }
}

export const integrityLedgerService = new IntegrityLedgerService();
