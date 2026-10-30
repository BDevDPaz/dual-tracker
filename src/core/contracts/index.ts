export * from "./types";

/**
 * `SessionRecord` existe con formas incompatibles en ambos archivos:
 * el legado (`types.ts`, con `lifecycle`/`destination`/`capturedLocation`,
 * usado por el motor reducer/effects) y el canónico congelado (`domain.ts`,
 * con `domainStatus`/`integrityClass`/`transitSegments`, usado por los
 * servicios Dual Tracker nuevos). Sin esta re-exportación explícita,
 * `export *` de ambos produce un error de ambigüedad (TS2308) en este
 * archivo, y peor aún, deja que el nombre `SessionRecord` importado desde
 * este barril se resuelva en silencio hacia la forma equivocada según el
 * archivo consumidor.
 *
 * Regla fija para evitar que el error reaparezca:
 * - El motor legado (reducer/effects/selectors/sessionStoreAdapter) sigue
 *   importando `SessionRecord` desde este barril sin cambios: seguirá
 *   siendo la forma legada de `types.ts`.
 * - Todo servicio o hook de la capa Dual Tracker DEBE importar
 *   `SessionRecord` directamente de `"../core/contracts/domain"` (nunca del
 *   barril) para obtener la forma canónica congelada.
 */
export type {
  DomainStatus,
  IntegrityClass,
  IntegrityReasonCode,
  TransitSegment,
  SpatialFactType,
  SpatialFact,
  LedgerActor,
  LedgerEntry,
  PayrollLine,
  PayrollStatement,
  PayrollPolicy,
  Site,
  EvidencePack,
  TraceMode,
  BackgroundTaskName,
} from "./domain";
