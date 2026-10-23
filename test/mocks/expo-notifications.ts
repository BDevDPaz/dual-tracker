/** Doble de expo-notifications: scheduleNotificationAsync empuja a un array; permiso configurable. */
type ResponseListener = (response: NotificationResponse) => void;
const listeners: ResponseListener[] = [];

export const __state = {
  permission: { status: "granted", granted: true, canAskAgain: true } as { status: string; granted: boolean; canAskAgain: boolean },
  scheduled: [] as { identifier?: string; content: unknown; trigger: unknown }[],
  dismissed: [] as string[],
  cancelled: [] as string[],
  channels: new Map<string, unknown>(),
};
export function __reset(): void {
  __state.permission = { status: "granted", granted: true, canAskAgain: true };
  __state.scheduled = [];
  __state.dismissed = [];
  __state.cancelled = [];
  __state.channels.clear();
  listeners.length = 0;
}
export function __emit(response: NotificationResponse): void {
  for (const listener of [...listeners]) listener(response);
}
export function __setPermission(status: "granted" | "denied" | "undetermined", canAskAgain = true): void {
  __state.permission = { status, granted: status === "granted", canAskAgain };
}

export const AndroidImportance = { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 };
export const SchedulableTriggerInputTypes = { DAILY: "daily", DATE: "date", TIME_INTERVAL: "timeInterval" };
export const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";
export type EventSubscription = { remove: () => void };
export type NotificationResponse = { actionIdentifier: string; notification: { request: { identifier: string; content: { data: Record<string, unknown> } } } };
export type NotificationPermissionsStatus = { status: string; granted: boolean; canAskAgain: boolean };

export async function getPermissionsAsync() {
  return __state.permission;
}
export async function requestPermissionsAsync() {
  return __state.permission;
}
export async function scheduleNotificationAsync(req: { identifier?: string; content: unknown; trigger: unknown }): Promise<string> {
  __state.scheduled.push(req);
  return req.identifier ?? `n-${__state.scheduled.length}`;
}
export async function cancelScheduledNotificationAsync(id: string) {
  __state.cancelled.push(id);
}
export async function dismissNotificationAsync(id: string) {
  __state.dismissed.push(id);
}
/**
 * Samsung One UI conserva el nombre del canal si solo se vuelve a llamar
 * setNotificationChannelAsync. El nombre nuevo entra al borrar y crear.
 */
export async function setNotificationChannelAsync(id: string, cfg: unknown) {
  const prev = __state.channels.get(id) as { name?: string } | undefined;
  if (prev && cfg && typeof cfg === "object" && "name" in (cfg as object)) {
    __state.channels.set(id, { ...(cfg as object), name: prev.name });
  } else {
    __state.channels.set(id, cfg);
  }
  return __state.channels.get(id);
}
export async function getNotificationChannelAsync(id: string) {
  return (__state.channels.get(id) as { name?: string } | undefined) ?? null;
}
export async function deleteNotificationChannelAsync(id: string) {
  __state.channels.delete(id);
}
export async function setNotificationCategoryAsync(id: string, actions: unknown) {
  return { identifier: id, actions };
}
export function setNotificationHandler(): void {}
export function addNotificationResponseReceivedListener(cb: ResponseListener): EventSubscription {
  listeners.push(cb);
  return {
    remove: () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}
export async function getLastNotificationResponseAsync() {
  return null;
}
