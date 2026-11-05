// core-v2/sessionService.ts - Sesiones: solo se crean en GEOFENCE_ENTRY

import { Jornada, WorkSession } from './types';
import { createAuditLog, AuditStorage } from './auditService';

export interface SessionStorage {
  getActiveJornada(): Promise<Jornada | null>;
  saveJornada(j: Jornada): Promise<void>;
  createSession(s: WorkSession): Promise<void>;
  closeSession(sessionId: string, exitAt: string, exitMethod: WorkSession['exitMethod']): Promise<void>;
}

export async function handleEntry(
  jornada: Jornada,
  addressInput: string,
  clientName: string,
  coordsUsed: { lat: number; lng: number },
  audit: AuditStorage
): Promise<WorkSession> {
  const session: WorkSession = {
    id: `sess-${Date.now()}`,
    jornadaId: jornada.id,
    addressInput,
    clientName,
    coordsUsed,
    entryAt: new Date().toISOString(),
    entryMethod: 'GEOFENCE_AUTO',
    status: 'ACTIVE',
  };
  // Guardar en SQLite y auditar
  await audit.insert(
    createAuditLog('AUTO_ENTRADA', jornada.id, `Auto check-in por geocerca ${addressInput}`, session.id, coordsUsed)
  );
  return session;
}

export async function handleExit(
  session: WorkSession,
  method: 'GEOFENCE_AUTO' | 'INACTIVITY_AUTO',
  audit: AuditStorage,
  coords?: { lat: number; lng: number }
) {
  const auditType = method === 'INACTIVITY_AUTO' ? 'AUTO_SALIDA_INACTIVIDAD' : 'AUTO_SALIDA';
  await audit.insert(
    createAuditLog(auditType, session.jornadaId, `Auto check-out ${method}`, session.id, coords)
  );
}

export function createNewJornada(): Jornada {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `jor-${today}-${Date.now()}`,
    date: today,
    sessions: [],
    status: 'IN_PROGRESS',
  };
}
