/**
 * refreshMirror — vuelve a leer SQLite y actualiza el store de reflejo.
 * ============================================================================
 * boot() hidrata una sola vez. Después, una tarea headless (geocerca,
 * watchdog, OS en otro contexto JS) puede escribir hechos, asientos o
 * cerrar la jornada sin que el store de la UI se entere. Este módulo
 * relee el snapshot y lo publica con StoreActions.refreshed.
 *
 * No toca nómina, ledger ni cifrado: solo lee. No reinicia la hidratación
 * (isRehydrating sigue en false: no hay flash de arranque) ni el desbloqueo
 * admin, los toasts ni las peticiones de UI.
 *
 * Una sola lectura en vuelo. Las llamadas cercanas se funden; el gesto de
 * deslizar pasa `force` y, si ya había una lectura, espera y repite una vez.
 */
import { Store, StoreActions } from "../../core/store";
import { notifyDataChanged, type DataScope } from "../../core/refresh/dataRevision";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { PersistenceService } from "../persistence/PersistenceService";
import { SettingsService } from "../persistence/SettingsService";

/** Hueco mínimo entre lecturas no forzadas (foco + primer plano). */
export const MIRROR_COALESCE_MS = 800;

const ALL_SCOPES: readonly DataScope[] = ["sessions", "sites", "packs", "ledger", "trace", "settings"];

export interface RefreshMirrorResult {
  /** El store cambió de contenido. */
  applied: boolean;
  /** No se leyó SQLite (aún hidratando, o llamada fundida). */
  skipped: boolean;
}

let inflight: Promise<RefreshMirrorResult> | null = null;
let lastFinishedAt = 0;
let forceQueued = false;

async function readAndPublish(): Promise<RefreshMirrorResult> {
  const [snapshot, settings, sharedPackIds] = await Promise.all([
    PersistenceService.loadSnapshot(),
    SettingsService.load(),
    IntegrityLedgerService.sharedPackIds().catch(() => [] as string[]),
  ]);
  const applied = StoreActions.refreshed({
    sessions: snapshot.sessions,
    sites: snapshot.sites,
    packs: snapshot.packs,
    sharedPackIds,
    settings,
    nowMs: TimeAuthorityService.now(),
  });
  // Aunque el reflejo no cambie, el ledger y el rastro sí pueden haber
  // crecido (BREADCRUMB / SPATIAL_FACT no reescriben la fila de la sesión).
  notifyDataChanged(ALL_SCOPES, { immediate: true });
  return { applied, skipped: false };
}

export function refreshMirror(opts?: { force?: boolean }): Promise<RefreshMirrorResult> {
  if (Store.getState().boot.isRehydrating) {
    return Promise.resolve({ applied: false, skipped: true });
  }
  if (inflight) {
    if (opts?.force) forceQueued = true;
    return inflight.then(() => {
      if (!forceQueued) return { applied: false, skipped: true };
      forceQueued = false;
      return refreshMirror({ force: true });
    });
  }
  if (!opts?.force && Date.now() - lastFinishedAt < MIRROR_COALESCE_MS) {
    return Promise.resolve({ applied: false, skipped: true });
  }
  const run = readAndPublish().finally(() => {
    inflight = null;
    lastFinishedAt = Date.now();
  });
  inflight = run;
  return run;
}

/** Solo pruebas. */
export function __resetForTests(): void {
  inflight = null;
  lastFinishedAt = 0;
  forceQueued = false;
}
