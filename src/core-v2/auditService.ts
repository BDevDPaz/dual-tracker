// core-v2/auditService.ts - Auditoría obligatoria, tolerante a offline

import { AuditLog, AuditType } from './types';

// En V1.0.0 esto va a SQLite. Por ahora es una interfaz limpia.
export interface AuditStorage {
  insert(log: AuditLog): Promise<void>;
  getByJornada(jornadaId: string): Promise<AuditLog[]>;
}

export function createAuditLog(
  type: AuditType,
  jornadaId: string,
  details: string,
  sessionId?: string,
  coords?: { lat: number; lng: number }
): AuditLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    jornadaId,
    sessionId,
    at: new Date().toISOString(),
    details,
    coords,
  };
}

// Uso:
// audit.insert(createAuditLog('AUTO_ENTRADA', jornadaId, 'Auto check-in por geocerca 150m', sessionId, coords))
