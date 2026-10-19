/**
 * Consejos de un solo uso. Se recuerdan en `dt.support.tips.v1` (no en SQLite).
 * Desde Soporte se pueden volver a mostrar.
 */
import { TIPS_STORAGE_KEY, supportGet, supportRemove, supportSet } from "./memory";
import type { TipId } from "./types";

type Listener = () => void;
const listeners = new Set<Listener>();
let dismissed = new Set<string>();
let ready = false;

export function subscribeTips(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function tipsLoaded(): boolean {
  return ready;
}

export function isTipDismissed(id: TipId): boolean {
  return dismissed.has(id);
}

export function dismissedTipIds(): string[] {
  return [...dismissed];
}

function emit(): void {
  for (const listener of listeners) listener();
}

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter((id) => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export async function loadTips(): Promise<void> {
  dismissed = parse(await supportGet(TIPS_STORAGE_KEY));
  ready = true;
  emit();
}

async function persist(): Promise<void> {
  await supportSet(TIPS_STORAGE_KEY, JSON.stringify([...dismissed]));
  emit();
}

export async function dismissTip(id: TipId): Promise<void> {
  if (!ready) await loadTips();
  dismissed = new Set(dismissed);
  dismissed.add(id);
  await persist();
}

export async function resetTips(): Promise<void> {
  dismissed = new Set();
  ready = true;
  await supportRemove(TIPS_STORAGE_KEY);
  emit();
}

export async function __resetTipsForTests(): Promise<void> {
  dismissed = new Set();
  ready = false;
  await supportRemove(TIPS_STORAGE_KEY);
  emit();
}
