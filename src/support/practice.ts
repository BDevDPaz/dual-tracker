/**
 * Modo práctica. Estado de demostración en memoria + `dt.practice.v1`.
 * Este archivo no importa persistencia, ledger, expedientes ni geocerca:
 * un recorrido de práctica no puede escribir el expediente real.
 */
import type { IntegrityClass, SessionRecordStatus, SessionState } from "../core/contracts";
import { PRACTICE_STORAGE_KEY, supportGet, supportRemove, supportSet } from "./memory";

export type PracticeCode = "ILLEGAL" | "NOTE_REQUIRED" | "ALREADY_OPEN";

export interface PracticeSession {
  phase: SessionRecordStatus;
  site: "A" | "B";
  viaStart: "manual" | "geofence";
  viaArrival: "manual" | "geofence" | null;
  lunch: boolean;
  transfer: boolean;
  transferArrived: boolean;
  viaClose: "manual" | "auto" | null;
  note: string | null;
  edited: boolean;
  forgot: boolean;
  integrity: IntegrityClass;
  blocked: boolean;
  sealed: boolean;
  provisional: boolean;
}

export interface PracticeSnapshot {
  active: boolean;
  session: PracticeSession | null;
}

export type PracticeAction =
  | { type: "START_MANUAL" }
  | { type: "START_GEOFENCE" }
  | { type: "CONFIRM_ARRIVAL" }
  | { type: "SIMULATE_ENTER" }
  | { type: "CANCEL_DAY" }
  | { type: "START_LUNCH" }
  | { type: "RESUME" }
  | { type: "START_TRANSFER" }
  | { type: "CANCEL_TRANSFER" }
  | { type: "DETECT_EXIT" }
  | { type: "STAY" }
  | { type: "CLOSE_MANUAL" }
  | { type: "CLOSE_AUTO" }
  | { type: "EDIT_NOTE"; note: string }
  | { type: "FORGOT_CLOCK"; note: string }
  | { type: "SEAL" }
  | { type: "RESET_DEMO" };

export const EMPTY_PRACTICE: PracticeSnapshot = { active: false, session: null };

type Listener = () => void;
const listeners = new Set<Listener>();
let current: PracticeSnapshot = EMPTY_PRACTICE;

export function getPracticeSnapshot(): PracticeSnapshot {
  return current;
}

export function subscribePractice(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function fresh(viaStart: "manual" | "geofence"): PracticeSession {
  return {
    phase: "ESPERANDO",
    site: "A",
    viaStart,
    viaArrival: null,
    lunch: false,
    transfer: false,
    transferArrived: false,
    viaClose: null,
    note: null,
    edited: false,
    forgot: false,
    integrity: "VALID",
    blocked: false,
    sealed: false,
    provisional: false,
  };
}

function noteOf(note: string): string | null {
  const trimmed = note.trim();
  return trimmed.length ? trimmed : null;
}

export function reducePractice(
  session: PracticeSession | null,
  action: PracticeAction,
): { session: PracticeSession | null; code?: PracticeCode } {
  const phase = session?.phase ?? null;
  const open = phase !== null && phase !== "CERRADA";

  switch (action.type) {
    case "RESET_DEMO":
      return { session: null };
    case "START_MANUAL":
    case "START_GEOFENCE": {
      if (session) return { session, code: "ALREADY_OPEN" };
      return { session: fresh(action.type === "START_MANUAL" ? "manual" : "geofence") };
    }
    case "CANCEL_DAY": {
      if (phase !== "ESPERANDO") return { session, code: "ILLEGAL" };
      return { session: null };
    }
    case "CONFIRM_ARRIVAL":
    case "SIMULATE_ENTER": {
      if (phase !== "ESPERANDO" && phase !== "TRASLADO") return { session, code: "ILLEGAL" };
      return {
        session: {
          ...session!,
          phase: "ACTIVA",
          site: phase === "TRASLADO" ? "B" : session!.site,
          viaArrival: action.type === "CONFIRM_ARRIVAL" ? "manual" : "geofence",
          transferArrived: phase === "TRASLADO" ? true : session!.transferArrived,
        },
      };
    }
    case "START_LUNCH": {
      if (phase !== "ACTIVA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "PAUSADA", lunch: true } };
    }
    case "RESUME": {
      if (phase !== "PAUSADA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "ACTIVA" } };
    }
    case "START_TRANSFER": {
      if (phase !== "ACTIVA" && phase !== "SALIDA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "TRASLADO", transfer: true, transferArrived: false } };
    }
    case "CANCEL_TRANSFER": {
      if (phase !== "TRASLADO") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "ACTIVA", transfer: false, transferArrived: false } };
    }
    case "DETECT_EXIT": {
      if (phase !== "ACTIVA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "SALIDA" } };
    }
    case "STAY": {
      if (phase !== "SALIDA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "ACTIVA" } };
    }
    case "CLOSE_MANUAL": {
      if (phase !== "ACTIVA" && phase !== "PAUSADA" && phase !== "SALIDA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, phase: "CERRADA", viaClose: "manual" } };
    }
    case "CLOSE_AUTO": {
      if (phase !== "ACTIVA" && phase !== "SALIDA") return { session, code: "ILLEGAL" };
      return {
        session: {
          ...session!,
          phase: "CERRADA",
          viaClose: "auto",
          integrity: session!.integrity === "VALID" ? "AUTO" : session!.integrity,
        },
      };
    }
    case "EDIT_NOTE": {
      if (!session) return { session, code: "ILLEGAL" };
      const note = noteOf(action.note);
      if (!note) return { session, code: "NOTE_REQUIRED" };
      return { session: { ...session, note, edited: true, integrity: "MANUAL" } };
    }
    case "FORGOT_CLOCK": {
      if (open) return { session, code: "ALREADY_OPEN" };
      const note = noteOf(action.note);
      if (!note) return { session, code: "NOTE_REQUIRED" };
      return {
        session: {
          ...fresh("manual"),
          phase: "CERRADA",
          viaArrival: "manual",
          viaClose: "manual",
          note,
          edited: true,
          forgot: true,
          integrity: "MANUAL",
        },
      };
    }
    case "SEAL": {
      if (phase !== "CERRADA") return { session, code: "ILLEGAL" };
      return { session: { ...session!, sealed: true, provisional: true } };
    }
  }
}

function publish(next: PracticeSnapshot): void {
  current = next;
  emit();
}

let chain: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function loadPractice(): Promise<PracticeSnapshot> {
  const raw = await supportGet(PRACTICE_STORAGE_KEY);
  if (!raw) {
    publish(EMPTY_PRACTICE);
    return current;
  }
  try {
    const parsed = JSON.parse(raw) as PracticeSnapshot;
    if (!parsed || typeof parsed.active !== "boolean") {
      publish(EMPTY_PRACTICE);
      return current;
    }
    publish({ active: parsed.active, session: parsed.session ?? null });
  } catch {
    publish(EMPTY_PRACTICE);
  }
  return current;
}

async function save(next: PracticeSnapshot): Promise<void> {
  publish(next);
  if (!next.active) {
    await supportRemove(PRACTICE_STORAGE_KEY);
    return;
  }
  await supportSet(PRACTICE_STORAGE_KEY, JSON.stringify(next));
}

export function enterPractice(): Promise<PracticeSnapshot> {
  return enqueue(async () => {
    const loaded = current.active ? current : await loadPractice();
    const next: PracticeSnapshot = { active: true, session: loaded.active ? loaded.session : null };
    await save(next);
    return current;
  });
}

/** Salir borra la demostración. El expediente real no se tocó, así que sigue igual. */
export function exitPractice(): Promise<void> {
  return enqueue(async () => {
    await save(EMPTY_PRACTICE);
  });
}

export function dispatchPractice(
  action: PracticeAction,
): Promise<{ ok: true; session: PracticeSession | null } | { ok: false; code: PracticeCode }> {
  return enqueue(async () => {
    if (!current.active) {
      await save({ active: true, session: current.session });
    }
    const reduced = reducePractice(current.session, action);
    if (reduced.code) return { ok: false, code: reduced.code };
    await save({ active: true, session: reduced.session });
    return { ok: true, session: reduced.session };
  });
}

export function practicePhase(snapshot: PracticeSnapshot): SessionState {
  return snapshot.session?.phase ?? "NO_INICIADA";
}

export async function __resetPracticeForTests(): Promise<void> {
  chain = Promise.resolve();
  current = EMPTY_PRACTICE;
  await supportRemove(PRACTICE_STORAGE_KEY);
  emit();
}
