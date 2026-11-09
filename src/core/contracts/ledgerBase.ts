/**
 * Base sin dependencias para romper el ciclo ledger <-> intents.
 * LedgerActor y LedgerIncident vivían en ledger.ts, e intents.ts los
 * importaba de ahí mientras ledger.ts importaba SessionIntentType de
 * intents.ts. Ahora los dos importan de aquí.
 * No importar nada de ./ledger ni de ./intents en este archivo.
 */
export type LedgerActor = "USER" | "GEOFENCE" | "WATCHDOG" | "SYSTEM";

/**
 * Incidente de cadena rota (spec v1.3 §5.5). Persistente en KV `ledger.broken`
 * hasta que el administrador lo reconoce con PIN.
 */
export interface LedgerIncident {
  /** Primer asiento que no verifica. */
  breakAtId: number;
  /** Último asiento válido (null si la ruptura está en el primer asiento). */
  lastGoodId: number | null;
  /** hash del último válido (GENESIS_HASH si lastGoodId es null). */
  lastGoodHash: string;
  /** prev_hash guardado en breakAtId. */
  observedPrevHash: string;
  /** hash guardado en breakAtId. */
  observedHash: string;
  /** sha256(prev esperado + payload guardado). */
  recomputedHash: string;
  detectedAtMs: number;
  headAtDetection: { id: number; hash: string };
}
