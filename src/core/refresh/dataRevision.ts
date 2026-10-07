/**
 * Revisión de datos — bus liviano de invalidación (mismo proceso JS).
 * ============================================================================
 * Las pantallas que leen el store se actualizan solas cuando un servicio
 * publica con StoreActions. Lo que NO vive en el store (ledger, rastro,
 * preview de nómina) se queda en caché de useQuery hasta que algo sube
 * esta revisión.
 *
 * Las escrituras de SQLite marcan un ámbito; un debounce corto las funde
 * en un solo aviso para no disparar una ráfaga (ENTER + asiento + sesión).
 * Dentro de una transacción el aviso espera al COMMIT: si hay ROLLBACK no
 * se publica nada.
 *
 * No cruza contextos. Una tarea headless escribe en otra isla de JS; eso
 * lo recoge refreshMirror al volver a primer plano, al enfocar o al
 * deslizar hacia abajo.
 */
export const DATA_SCOPES = ["sessions", "sites", "packs", "ledger", "trace", "settings"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

/** Ventana para fundir escrituras seguidas (geocerca + ledger + sesión). */
export const DATA_REVISION_DEBOUNCE_MS = 200;

type Listener = (revision: number, scopes: readonly DataScope[]) => void;

let revision = 0;
let lastScopes: readonly DataScope[] = [];
const listeners = new Set<Listener>();

let buffering = false;
const buffer = new Set<DataScope>();
const pending = new Set<DataScope>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flushPending(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;
  const scopes = [...pending];
  pending.clear();
  revision += 1;
  lastScopes = scopes;
  const rev = revision;
  listeners.forEach((listener) => {
    try {
      listener(rev, scopes);
    } catch (error) {
      if (__DEV__) console.error("[dataRevision] listener:", error);
    }
  });
}

/**
 * Agenda un aviso. `immediate` (rehidratación / gesto) publica ya, fundiendo
 * lo que aún estuviera en la ventana de debounce.
 */
export function notifyDataChanged(scopes: readonly DataScope[], opts?: { immediate?: boolean }): void {
  for (const scope of scopes) pending.add(scope);
  if (opts?.immediate) {
    flushPending();
    return;
  }
  if (timer) return;
  timer = setTimeout(flushPending, DATA_REVISION_DEBOUNCE_MS);
}

/**
 * Escritura persistida. Dentro de transacción queda en el buffer hasta el
 * COMMIT; fuera, se agenda el debounce.
 */
export function markPersisted(scope: DataScope): void {
  if (buffering) {
    buffer.add(scope);
    return;
  }
  notifyDataChanged([scope]);
}

/** PersistenceService.transaction: abre el buffer tras BEGIN. */
export function beginWriteBuffer(): void {
  buffering = true;
  buffer.clear();
}

/** COMMIT: el buffer pasa a la ventana de debounce. */
export function flushWriteBuffer(): void {
  buffering = false;
  if (buffer.size === 0) return;
  const scopes = [...buffer];
  buffer.clear();
  notifyDataChanged(scopes);
}

/** ROLLBACK: se olvida lo marcado en esta transacción. */
export function abortWriteBuffer(): void {
  buffering = false;
  buffer.clear();
}

export function getDataRevision(): number {
  return revision;
}

export function getLastDataScopes(): readonly DataScope[] {
  return lastScopes;
}

export function subscribeDataRevision(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Solo pruebas: publica ya lo pendiente. */
export function __flushForTests(): void {
  flushPending();
}

/** Solo pruebas: vuelve a cero y cancela temporizadores. */
export function __resetForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  buffering = false;
  buffer.clear();
  pending.clear();
  revision = 0;
  lastScopes = [];
  listeners.clear();
}
