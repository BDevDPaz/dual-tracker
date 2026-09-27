/**
 * Doble de expo-location. startGeofencingAsync registra la configuración y NO
 * dispara eventos: los tests invocan el handler de la tarea a mano.
 */
type Perm = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean; granted: boolean };
const perm = (status: Perm["status"], canAskAgain = true): Perm => ({ status, canAskAgain, granted: status === "granted" });

export enum GeofencingEventType {
  Enter = 1,
  Exit = 2,
}
export enum Accuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}
export enum ActivityType {
  Other = 1,
}

export interface MockPosition {
  coords: { latitude: number; longitude: number; accuracy: number | null; speed: number | null; altitude: number | null; heading: number | null; altitudeAccuracy: number | null };
  timestamp: number;
}

export const __state = {
  foreground: perm("granted"),
  background: perm("granted"),
  servicesEnabled: true,
  position: null as MockPosition | null,
  geofences: new Map<string, unknown[]>(),
  locationUpdates: new Map<string, unknown>(),
  geocode: [] as { latitude: number; longitude: number }[],
};

export function __reset(): void {
  __state.foreground = perm("granted");
  __state.background = perm("granted");
  __state.servicesEnabled = true;
  __state.position = null;
  __state.geofences.clear();
  __state.locationUpdates.clear();
  __state.geocode = [];
}
export function __setPermissions(p: { foreground?: Perm["status"]; background?: Perm["status"]; canAskAgain?: boolean }): void {
  if (p.foreground) __state.foreground = perm(p.foreground, p.canAskAgain ?? true);
  if (p.background) __state.background = perm(p.background, p.canAskAgain ?? true);
}
export function __setPosition(lat: number, lon: number, accuracy: number | null = 10, speed: number | null = 0): void {
  __state.position = { coords: { latitude: lat, longitude: lon, accuracy, speed, altitude: null, heading: null, altitudeAccuracy: null }, timestamp: Date.now() };
}

export async function getForegroundPermissionsAsync() {
  return __state.foreground;
}
export async function getBackgroundPermissionsAsync() {
  return __state.background;
}
export async function requestForegroundPermissionsAsync() {
  return __state.foreground;
}
export async function requestBackgroundPermissionsAsync() {
  return __state.background;
}
export async function hasServicesEnabledAsync() {
  return __state.servicesEnabled;
}
export async function getCurrentPositionAsync() {
  if (!__state.position) throw new Error("NO_FIX");
  return __state.position;
}
export async function startGeofencingAsync(task: string, regions: unknown[]) {
  __state.geofences.set(task, regions);
}
export async function stopGeofencingAsync(task: string) {
  __state.geofences.delete(task);
}
export async function hasStartedGeofencingAsync(task: string) {
  return __state.geofences.has(task);
}
export async function startLocationUpdatesAsync(task: string, options: unknown) {
  __state.locationUpdates.set(task, options);
}
export async function stopLocationUpdatesAsync(task: string) {
  __state.locationUpdates.delete(task);
}
export async function hasStartedLocationUpdatesAsync(task: string) {
  return __state.locationUpdates.has(task);
}
export async function geocodeAsync() {
  return __state.geocode;
}
