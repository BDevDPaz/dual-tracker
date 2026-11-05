// core-v2/geofenceService.ts - Solo geofencing, sin tracking continuo de 3.2km
// V1.0.0 usa expo-location y expo-task-manager

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const GEOFENCE_TASK = 'GEOFENCE_TRACKING_TASK';
export const GEOFENCE_RADIUS = 150; // metros - entrada y salida usan el mismo radio

export interface GeofenceRegion {
  identifier: string; // jornadaId o sessionId
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export async function requestPermissions(): Promise<boolean> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return bg === 'granted';
}

export async function armGeofence(region: GeofenceRegion) {
  // Borra geocercas anteriores para no acumular
  const hasStarted = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (hasStarted) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
  await Location.startGeofencingAsync(GEOFENCE_TASK, [region]);
}

export async function disarmGeofence() {
  const hasStarted = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (hasStarted) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
}

// Este se define UNA vez en bootWiring.ts
export function defineGeofenceTask(
  onEnter: (region: GeofenceRegion) => void,
  onExit: (region: GeofenceRegion) => void
) {
  TaskManager.defineTask(GEOFENCE_TASK, ({ data, error }) => {
    if (error) {
      console.error('Geofence error', error);
      return;
    }
    const { eventType, region } = data as any;
    if (eventType === Location.GeofencingEventType.Enter) {
      onEnter(region);
    } else if (eventType === Location.GeofencingEventType.Exit) {
      onExit(region);
    }
  });
}
