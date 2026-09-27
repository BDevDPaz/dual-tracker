/** Fixture de LedgerEntry: cadena de tres asientos con prevHash encadenado (hash real SHA-256). */
import type { LedgerEntry } from "../../src/core/contracts";
import { GENESIS_HASH } from "../../src/core/contracts";
import { chainHash } from "../../src/services/evidence/HashChain";
import { canonicalJson } from "../../src/utils/canonicalJson";
import { MIN, MONDAY_8AM } from "./session.fixture";

type Draft = Omit<LedgerEntry, "id" | "prevHash" | "hash" | "payloadJson">;

const DRAFTS: Draft[] = [
  { sessionId: 1, actor: "USER", intent: "START_DAY", fromState: "NO_INICIADA", toState: "ESPERANDO", reason: "DAY_STARTED", timestampMs: MONDAY_8AM, integrityClass: "VALID" },
  { sessionId: 1, actor: "GEOFENCE", intent: "ARRIVAL_CONFIRMED", fromState: "ESPERANDO", toState: "ACTIVA", reason: "AUTO_CHECKIN_GEOFENCE_ENTRY", timestampMs: MONDAY_8AM + 10 * MIN, integrityClass: "VALID" },
  { sessionId: 1, actor: "USER", intent: "CLOSE_DAY", fromState: "ACTIVA", toState: "CERRADA", reason: "MANUAL_ACTION_EXPLICIT", timestampMs: MONDAY_8AM + 9 * 60 * MIN, integrityClass: "VALID" },
];

export async function makeLedgerChain(drafts: Draft[] = DRAFTS): Promise<LedgerEntry[]> {
  const out: LedgerEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < drafts.length; i++) {
    const payloadJson = canonicalJson({ ...drafts[i], data: null });
    const hash = await chainHash(prev, payloadJson);
    out.push({ ...drafts[i], id: i + 1, prevHash: prev, hash, payloadJson });
    prev = hash;
  }
  return out;
}
