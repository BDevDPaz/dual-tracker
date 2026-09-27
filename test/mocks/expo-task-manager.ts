/** Doble de expo-task-manager: defineTask guarda el callback; isTaskRegisteredAsync lee un Set. */
export type TaskManagerTaskBody<T = unknown> = { data: T; error: { code: string | number; message: string } | null; executionInfo: { eventId: string; taskName: string } };
type Executor = (body: TaskManagerTaskBody<unknown>) => Promise<unknown> | unknown;

export const __tasks = new Map<string, Executor>();
export const __registered = new Set<string>();

export function defineTask(name: string, executor: Executor): void {
  __tasks.set(name, executor);
}
export function isTaskDefined(name: string): boolean {
  return __tasks.has(name);
}
export async function isTaskRegisteredAsync(name: string): Promise<boolean> {
  return __registered.has(name);
}
export async function unregisterAllTasksAsync(): Promise<void> {
  __registered.clear();
}
/** Invoca el handler definido con un payload fabricado. */
export async function __run<T>(name: string, data: T, error: TaskManagerTaskBody["error"] = null): Promise<unknown> {
  const fn = __tasks.get(name);
  if (!fn) throw new Error(`task ${name} not defined`);
  return fn({ data, error, executionInfo: { eventId: "test", taskName: name } });
}
export function __reset(): void {
  __registered.clear();
}
