/**
 * Arnés de runtime: vigila que el estado de la jornada solo cambie dentro de
 * SessionEngineService.dispatch (Propuesta de calidad §4.5: "ENTER/EXIT emiten
 * SpatialFact, no UPDATE de status"). PersistenceService no tiene
 * `updateStatus`; su equivalente real es `updateSession`/`insertSession`.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { SessionEngineService } from "../src/services/domain/SessionEngineService";
import { PersistenceService } from "../src/services/persistence/PersistenceService";

export type LocationMock = typeof Location & {
  __setPosition(lat: number, lon: number, accuracy?: number | null, speed?: number | null, extra?: { timestamp?: number; mocked?: boolean }): void;
  __setStartLocationUpdatesError(error: Error | null): void;
  __setPermissions(p: { foreground?: "granted" | "denied" | "undetermined"; background?: "granted" | "denied" | "undetermined"; canAskAgain?: boolean }): void;
  __state: { servicesEnabled: boolean; position: unknown; geofences: Map<string, unknown[]>; locationUpdates: Map<string, unknown> };
};
export type TaskManagerMock = typeof TaskManager & {
  __run<T>(name: string, data: T, error?: { code: string | number; message: string } | null): Promise<unknown>;
  __tasks: Map<string, unknown>;
};
export const LocationMock = Location as LocationMock;
export const TaskManagerMock = TaskManager as TaskManagerMock;

/**
 * Espía dispatch (dejándolo pasar) y registra cualquier escritura de sesión
 * que ocurra FUERA de un dispatch en curso.
 */
export function watchStatusWrites() {
  let depth = 0;
  const realDispatch = SessionEngineService.dispatch;
  const realUpdate = PersistenceService.updateSession;
  const realInsert = PersistenceService.insertSession;
  const outside: string[] = [];
  const dispatch = jest.spyOn(SessionEngineService, "dispatch").mockImplementation(async (intent, origin) => {
    depth++;
    try {
      return await realDispatch.call(SessionEngineService, intent, origin);
    } finally {
      depth--;
    }
  });
  const updates = jest.spyOn(PersistenceService, "updateSession").mockImplementation((record, db) => {
    if (depth === 0) outside.push(`updateSession:${record.domainStatus}`);
    return realUpdate.call(PersistenceService, record, db);
  });
  const inserts = jest.spyOn(PersistenceService, "insertSession").mockImplementation((record, db) => {
    if (depth === 0) outside.push(`insertSession:${record.domainStatus}`);
    return realInsert.call(PersistenceService, record, db);
  });
  return { dispatch, updates, inserts, outside, intents: () => dispatch.mock.calls.map((c) => c[0].type) };
}
