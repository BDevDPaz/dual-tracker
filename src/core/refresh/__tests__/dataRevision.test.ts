/** Revisión de datos: debounce, buffer de transacción y baja de listeners. */
import {
  DATA_REVISION_DEBOUNCE_MS,
  abortWriteBuffer,
  beginWriteBuffer,
  flushWriteBuffer,
  getDataRevision,
  getLastDataScopes,
  markPersisted,
  notifyDataChanged,
  subscribeDataRevision,
  __flushForTests,
} from "../dataRevision";

describe("dataRevision", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("funde avisos seguidos en una sola revisión", () => {
    jest.useFakeTimers();
    const seen: { rev: number; scopes: readonly string[] }[] = [];
    const unsub = subscribeDataRevision((rev, scopes) => seen.push({ rev, scopes }));
    notifyDataChanged(["trace"]);
    notifyDataChanged(["ledger"]);
    expect(getDataRevision()).toBe(0);
    jest.advanceTimersByTime(DATA_REVISION_DEBOUNCE_MS);
    expect(getDataRevision()).toBe(1);
    expect(seen).toHaveLength(1);
    expect([...seen[0].scopes].sort()).toEqual(["ledger", "trace"]);
    unsub();
    notifyDataChanged(["sessions"], { immediate: true });
    expect(seen).toHaveLength(1);
    expect(getDataRevision()).toBe(2);
  });

  test("immediate publica ya y cancela el temporizador pendiente", () => {
    jest.useFakeTimers();
    notifyDataChanged(["trace"]);
    notifyDataChanged(["packs"], { immediate: true });
    expect(getDataRevision()).toBe(1);
    expect([...getLastDataScopes()].sort()).toEqual(["packs", "trace"]);
    jest.advanceTimersByTime(DATA_REVISION_DEBOUNCE_MS * 3);
    expect(getDataRevision()).toBe(1);
  });

  test("el buffer de transacción no avisa hasta el COMMIT y el ROLLBACK lo tira", () => {
    jest.useFakeTimers();
    beginWriteBuffer();
    markPersisted("trace");
    abortWriteBuffer();
    __flushForTests();
    jest.advanceTimersByTime(DATA_REVISION_DEBOUNCE_MS);
    expect(getDataRevision()).toBe(0);

    beginWriteBuffer();
    markPersisted("ledger");
    markPersisted("sessions");
    flushWriteBuffer();
    expect(getDataRevision()).toBe(0);
    jest.advanceTimersByTime(DATA_REVISION_DEBOUNCE_MS);
    expect(getDataRevision()).toBe(1);
    expect([...getLastDataScopes()].sort()).toEqual(["ledger", "sessions"]);
  });

  test("fuera de transacción markPersisted agenda el debounce", () => {
    jest.useFakeTimers();
    markPersisted("settings");
    expect(getDataRevision()).toBe(0);
    jest.advanceTimersByTime(DATA_REVISION_DEBOUNCE_MS);
    expect(getLastDataScopes()).toEqual(["settings"]);
  });
});
