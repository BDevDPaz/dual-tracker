// src/core-v2/useActiveSessionV2.ts
// Hook principal V1.0.0 limpio - Reemplaza tu useActiveSession.ts viejo
// Usa: stateMachine + geofenceService + sessionService + auditService + SQLite

import { useState, useEffect, useRef, useCallback } from 'react';
import * as SQLite from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { WorkState, WorkEvent, Jornada, WorkSession } from './types';
import { transition, getSideEffects } from './stateMachine';
import { armGeofence, disarmGeofence, GEOFENCE_RADIUS, requestPermissions } from './geofenceService';
import { createNewJornada } from './sessionService';
import { createAuditLog } from './auditService';

// DB V1.0.0 - Simple, offline first
const db = SQLite.openDatabaseSync('dualTrackerV2.db');

function initDB() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS jornadas (id TEXT PRIMARY KEY, date TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, jornadaId TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, jornadaId TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);
  `);
}

export function useActiveSessionV2() {
  const [workState, setWorkState] = useState<WorkState>('IDLE');
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const waitingSinceRef = useRef<number | null>(null);

  // Cargar estado al iniciar
  useEffect(() => {
    initDB();
    const load = async () => {
      const stateRow = db.getFirstSync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', ['workState']);
      const jornadaRow = db.getFirstSync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', ['activeJornadaId']);
      
      if (stateRow) setWorkState(stateRow.value as WorkState);
      
      if (jornadaRow) {
        const jRow = db.getFirstSync<{ data: string }>('SELECT data FROM jornadas WHERE id = ?', [jornadaRow.value]);
        if (jRow) {
          const j: Jornada = JSON.parse(jRow.data);
          setJornada(j);
          const active = j.sessions.find(s => s.status === 'ACTIVE') || null;
          setActiveSession(active);
        }
      }
      setIsReady(true);
    };
    load();
  }, []);

  // Persistir estado
  const persistState = useCallback((newState: WorkState, j: Jornada | null) => {
    db.runSync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', ['workState', newState]);
    if (j) {
      db.runSync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', ['activeJornadaId', j.id]);
      db.runSync('INSERT OR REPLACE INTO jornadas (id, date, data) VALUES (?, ?, ?)', [j.id, j.date, JSON.stringify(j)]);
    }
  }, []);

  // Timer de inactividad para WAITING_DECISION (15 min)
  useEffect(() => {
    if (workState === 'WAITING_DECISION') {
      waitingSinceRef.current = Date.now();
      inactivityTimerRef.current = setInterval(() => {
        if (waitingSinceRef.current && Date.now() - waitingSinceRef.current > 15 * 60 * 1000) {
          handleEvent({ type: 'INACTIVITY_TIMEOUT' });
        }
      }, 60 * 1000);
    } else {
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
      waitingSinceRef.current = null;
    }
    return () => {
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
  }, [workState]);

  const handleEvent = useCallback(async (event: WorkEvent) => {
    const prevState = workState;
    const nextState = transition(prevState, event);
    const effects = getSideEffects(prevState, nextState, event);

    console.log(`[CORE-V2] ${prevState} + ${event.type} => ${nextState}`, effects);

    let currentJornada = jornada;
    let currentSession = activeSession;

    // Efecto: Armar geocerca
    if (effects.shouldArmGeofence) {
      const hasPerm = await requestPermissions();
      if (!hasPerm) {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Permiso requerido', body: 'Activa ubicación siempre para que Dual Tracker funcione cerrado.' },
          trigger: null,
        });
        return;
      }
      const payload = (event as any).payload;
      if (payload?.coords) {
        if (!currentJornada || prevState === 'IDLE' || prevState === 'DAY_FINISHED') {
          currentJornada = createNewJornada();
        }
        await armGeofence({
          identifier: currentJornada.id,
          latitude: payload.coords.lat,
          longitude: payload.coords.lng,
          radius: GEOFENCE_RADIUS,
          notifyOnEnter: true,
          notifyOnExit: true,
        });
        // Audit GEOFENCE_ARMED
        const log = createAuditLog('GEOFENCE_ARMED', currentJornada.id, `Geocerca armada ${payload.address}`, undefined, payload.coords);
        db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);
      }
    }

    // Efecto: Crear sesión en ENTRY
    if (effects.shouldCreateSession) {
      const entryPayload = (jornada?.sessions.length ? null : (event as any).payload) || (await getLastSetupPayload());
      const session: WorkSession = {
        id: `sess-${Date.now()}`,
        jornadaId: currentJornada!.id,
        addressInput: entryPayload?.address || currentJornada?.sessions[0]?.addressInput || 'Sitio',
        clientName: entryPayload?.clientName || 'Cliente',
        coordsUsed: entryPayload?.coords || { lat: 0, lng: 0 },
        entryAt: new Date().toISOString(),
        entryMethod: 'GEOFENCE_AUTO',
        status: 'ACTIVE',
      };
      currentJornada!.sessions = [...currentJornada!.sessions, session];
      currentSession = session;
      db.runSync('INSERT OR REPLACE INTO sessions (id, jornadaId, data) VALUES (?, ?, ?)', [session.id, currentJornada!.id, JSON.stringify(session)]);
      const log = createAuditLog('AUTO_ENTRADA', currentJornada!.id, `Auto check-in por geocerca 150m`, session.id, session.coordsUsed);
      db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Jornada iniciada', body: `Has llegado a ${session.addressInput}. Cronómetro corriendo.` },
        trigger: null,
      });
    }

    // Efecto: Notificar salida
    if (effects.shouldNotifyExit) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Saliste del área',
          body: '¿Qué deseas hacer?',
          data: { type: 'GEOFENCE_EXIT', jornadaId: currentJornada?.id },
        },
        trigger: null,
      });
    }

    // Efecto: Cerrar sesión
    if (effects.shouldCloseSession && currentSession) {
      const method = event.type === 'INACTIVITY_TIMEOUT' ? 'INACTIVITY_AUTO' : 'GEOFENCE_AUTO';
      currentSession.exitAt = new Date().toISOString();
      currentSession.exitMethod = method as any;
      currentSession.status = 'CLOSED';
      db.runSync('INSERT OR REPLACE INTO sessions (id, jornadaId, data) VALUES (?, ?, ?)', [currentSession.id, currentSession.jornadaId, JSON.stringify(currentSession)]);
      const logType = method === 'INACTIVITY_AUTO' ? 'AUTO_SALIDA_INACTIVIDAD' : 'AUTO_SALIDA';
      const log = createAuditLog(logType as any, currentJornada!.id, `Auto check-out ${method}`, currentSession.id);
      db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);
      setActiveSession(null);
      currentSession = null;
      if (method === 'INACTIVITY_AUTO') {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Jornada cerrada automáticamente', body: 'Se cerró por 15 min de inactividad fuera del sitio.' },
          trigger: null,
        });
        await disarmGeofence();
      }
    }

    // Efecto: Viaje
    if (effects.shouldStartTravel && currentJornada) {
      const log = createAuditLog('TRAVEL_START', currentJornada.id, 'Usuario va a otro trabajo, cronómetro sigue');
      db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);
    }

    // Guardar
    if (currentJornada) {
      persistState(nextState, currentJornada);
      setJornada({ ...currentJornada });
    } else {
      persistState(nextState, null);
    }
    setWorkState(nextState);
  }, [workState, jornada, activeSession, persistState]);

  // Helpers expuestos a la UI
  const saveDailySetup = useCallback((address: string, clientName: string, coords: { lat: number; lng: number }, notes?: string) => {
    return handleEvent({ type: 'DAILY_SETUP_SAVED', payload: { address, clientName, notes, coords } });
  }, [handleEvent]);

  const saveNewWorkSetup = useCallback((address: string, clientName: string, coords: { lat: number; lng: number }, notes?: string) => {
    return handleEvent({ type: 'NEW_WORK_SETUP_SAVED', payload: { address, clientName, notes, coords } });
  }, [handleEvent]);

  const selectNewWork = useCallback(() => handleEvent({ type: 'USER_SELECT_NEW_WORK' }), [handleEvent]);
  const selectEndDay = useCallback(async () => {
    await handleEvent({ type: 'USER_SELECT_END_DAY' });
    await disarmGeofence();
  }, [handleEvent]);

  // Llamado desde el TaskManager cuando entra
  const onGeofenceEnter = useCallback(() => handleEvent({ type: 'GEOFENCE_ENTRY' }), [handleEvent]);
  const onGeofenceExit = useCallback(() => handleEvent({ type: 'GEOFENCE_EXIT' }), [handleEvent]);

  return {
    isReady,
    workState,
    jornada,
    activeSession,
    saveDailySetup,
    saveNewWorkSetup,
    selectNewWork,
    selectEndDay,
    onGeofenceEnter,
    onGeofenceExit,
    handleEvent, // por si lo necesitas manual para testing
  };
}

// Helper para recuperar último payload si no viene en el evento
async function getLastSetupPayload(): Promise<any> {
  return null;
}
