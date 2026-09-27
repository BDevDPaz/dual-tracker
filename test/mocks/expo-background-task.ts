/** Doble de expo-background-task. */
export enum BackgroundTaskResult {
  Success = 1,
  Failed = 2,
}
export enum BackgroundTaskStatus {
  Restricted = 1,
  Available = 2,
}
export const __state = { status: BackgroundTaskStatus.Available as BackgroundTaskStatus, registered: [] as { name: string; options: unknown }[] };
export async function getStatusAsync() {
  return __state.status;
}
export async function registerTaskAsync(name: string, options: unknown) {
  __state.registered.push({ name, options });
}
export async function triggerTaskWorkerForTestingAsync() {
  return true;
}
export function __reset(): void {
  __state.status = BackgroundTaskStatus.Available;
  __state.registered = [];
}
