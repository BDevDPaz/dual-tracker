// src/core-v2/bootWiringV2.ts
// Reemplaza tu bootWiring.ts viejo. Este inicia todo el core-v2 + notificaciones programadas.
// Llamar una sola vez en app/_layout.tsx o App.tsx

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { GEOFENCE_TASK, defineGeofenceTask } from './geofenceService';
import { createAuditLog } from './auditService';

const db = SQLite.openDatabaseSync('dualTrackerV2.db');

// Configuración global de notificaciones - cómo se muestran en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// IDs para poder cancelar/reprogramar
const DAILY_SETUP_ID = 'daily-setup-7am';
const LUNCH_ID = 'lunch-1230pm';

export async function initBootV2() {
  console.log('[BOOT-V2] Iniciando core-v2...');

  // 1. Inicializar DB
  db.execSync(`
    CREATE TABLE IF NOT EXISTS jornadas (id TEXT PRIMARY KEY, date TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, jornadaId TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, jornadaId TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS pending_events (id TEXT PRIMARY KEY, type TEXT, payload TEXT, createdAt TEXT);
  `);

  // 2. Permisos
  const notifPerm = await Notifications.requestPermissionsAsync();
  const fgPerm = await Location.requestForegroundPermissionsAsync();
  let bgPerm = { status: 'undetermined' as any };
  if (fgPerm.status === 'granted') {
    bgPerm = await Location.requestBackgroundPermissionsAsync();
  }

  if (notifPerm.status !== 'granted') {
    console.warn('[BOOT-V2] Permiso de notificaciones denegado');
  }
  if (bgPerm.status !== 'granted') {
    console.warn('[BOOT-V2] Permiso background location denegado - geocerca no funcionará con app cerrada');
  }

  // 3. Definir tarea de geofencing (solo una vez, antes de usar startGeofencing)
  if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
    defineGeofenceTask(
      async (region) => {
        // ENTRY - aunque app esté cerrada
        console.log('[GEOFENCE] ENTRY', region.identifier);
        const log = createAuditLog('AUTO_ENTRADA', region.identifier, `Geofence ENTRY detectado en background`, undefined, {
          lat: region.latitude,
          lng: region.longitude,
        });
        db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);
        db.runSync('INSERT OR REPLACE INTO pending_events (id, type, payload, createdAt) VALUES (?, ?, ?, ?)', [
          `entry-${Date.now()}`,
          'GEOFENCE_ENTRY',
          JSON.stringify(region),
          new Date().toISOString(),
        ]);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Jornada iniciada automáticamente',
            body: 'Detectamos que llegaste al sitio. Cronómetro corriendo.',
            data: { type: 'GEOFENCE_ENTRY', jornadaId: region.identifier },
          },
          trigger: null,
        });
      },
      async (region) => {
        // EXIT - aunque app esté cerrada
        console.log('[GEOFENCE] EXIT', region.identifier);
        const log = createAuditLog('AUTO_SALIDA', region.identifier, `Geofence EXIT detectado en background - esperando decisión`);
        db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);
        db.runSync('INSERT OR REPLACE INTO pending_events (id, type, payload, createdAt) VALUES (?, ?, ?, ?)', [
          `exit-${Date.now()}`,
          'GEOFENCE_EXIT',
          JSON.stringify(region),
          new Date().toISOString(),
        ]);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Saliste del área de trabajo',
            body: '¿Qué deseas hacer? Toca para elegir: Otro sitio o Terminar jornada.',
            data: { type: 'GEOFENCE_EXIT', jornadaId: region.identifier },
          },
          trigger: null,
        });
      }
    );
  }

  // 4. Programar notificaciones diarias (7:00 AM y 12:30 PM)
  await scheduleDailyNotifications();

  // 5. Listener de respuesta a notificaciones (cuando el usuario toca)
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as any;
    console.log('[BOOT-V2] Notificación tocada', data);

    // Guardamos intención para que HoyScreen la abra
    if (data?.type === 'GEOFENCE_EXIT') {
      db.runSync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', ['pendingModal', 'POST_WORK']);
    } else if (data?.type === 'DAILY_SETUP') {
      db.runSync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', ['pendingModal', 'DAILY_SETUP']);
    } else if (data?.type === 'LUNCH') {
      db.runSync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', ['pendingModal', 'LUNCH']);
    }
  });

  // 6. Listener de eventos pendientes al volver a foreground
  // Tu HoyScreen debe leer pending_events al iniciar
  console.log('[BOOT-V2] Core-v2 listo');
}

async function scheduleDailyNotifications() {
  // Cancelar anteriores para no duplicar
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier === DAILY_SETUP_ID || n.identifier === LUNCH_ID) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  // 7:00 AM - Configurar primer destino
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_SETUP_ID,
    content: {
      title: 'Buenos días - Configura tu día',
      body: '¿A dónde vas a trabajar hoy? Toca para configurar tu primer destino.',
      data: { type: 'DAILY_SETUP' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 7,
      minute: 0,
    } as any,
  });

  // 12:30 PM - Almuerzo
  await Notifications.scheduleNotificationAsync({
    identifier: LUNCH_ID,
    content: {
      title: '¿Vas a tomar tu hora de lonche?',
      body: 'Toca para registrar si tomaste almuerzo. Queda auditado.',
      data: { type: 'LUNCH' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 12,
      minute: 30,
    } as any,
  });

  console.log('[BOOT-V2] Notificaciones programadas: 7:00 AM y 12:30 PM');
}

// Helper para tu HoyScreen - lee eventos que pasaron con app cerrada
export function getPendingGeofenceEvents(): { type: string; payload: any }[] {
  const rows = db.getAllSync<{ type: string; payload: string }>('SELECT type, payload FROM pending_events ORDER BY createdAt ASC');
  return rows.map((r) => ({ type: r.type, payload: JSON.parse(r.payload) }));
}

export function clearPendingEvents() {
  db.execSync('DELETE FROM pending_events');
}

export function getPendingModal(): string | null {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', ['pendingModal']);
  return row?.value || null;
}

export function clearPendingModal() {
  db.runSync('DELETE FROM app_state WHERE key = ?', ['pendingModal']);
}
