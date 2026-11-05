// core-v2/types.ts - Tipos congelados V1.0.0 - Sin ambigüedades

export type WorkState = 
  | 'IDLE' // No hay geocerca ni sesión
  | 'GEOFENCE_ARMED' // Geocerca activa, esperando llegada
  | 'ACTIVE_SESSION' // Dentro del sitio, cronómetro corriendo
  | 'WAITING_DECISION' // Salió del sitio, esperando que elija
  | 'TRAVEL' // Va a otro trabajo, cronómetro sigue
  | 'DAY_FINISHED'; // Jornada terminada

export type WorkEvent =
  | { type: 'DAILY_SETUP_SAVED'; payload: { address: string; clientName: string; notes?: string; coords: { lat: number; lng: number } } }
  | { type: 'GEOFENCE_ENTRY' }
  | { type: 'GEOFENCE_EXIT' }
  | { type: 'USER_SELECT_NEW_WORK' }
  | { type: 'USER_SELECT_END_DAY' }
  | { type: 'NEW_WORK_SETUP_SAVED'; payload: { address: string; clientName: string; notes?: string; coords: { lat: number; lng: number } } }
  | { type: 'INACTIVITY_TIMEOUT' } // 15 min sin responder
  | { type: 'LUNCH_RECORDED'; payload: { taken: boolean } };

export type AuditType =
  | 'GEOFENCE_ARMED'
  | 'AUTO_ENTRADA'
  | 'AUTO_SALIDA'
  | 'AUTO_SALIDA_INACTIVIDAD'
  | 'MANUAL_TERMINATE'
  | 'TRAVEL_START'
  | 'LUNCH_TAKEN'
  | 'LUNCH_SKIPPED';

export interface WorkSession {
  id: string;
  jornadaId: string;
  addressInput: string;
  clientName: string;
  coordsUsed: { lat: number; lng: number };
  addressReal?: string; // reverse geocoding si aplica
  entryAt: string; // ISO
  exitAt?: string; // ISO
  entryMethod: 'GEOFENCE_AUTO';
  exitMethod?: 'GEOFENCE_AUTO' | 'INACTIVITY_AUTO' | 'MANUAL';
  status: 'ACTIVE' | 'CLOSED';
  notes?: string;
}

export interface Jornada {
  id: string;
  date: string; // YYYY-MM-DD
  sessions: WorkSession[];
  lunch?: { taken: boolean; at: string };
  status: 'IN_PROGRESS' | 'FINISHED';
}

export interface AuditLog {
  id: string;
  type: AuditType;
  sessionId?: string;
  jornadaId: string;
  at: string; // ISO
  details: string;
  coords?: { lat: number; lng: number };
}
