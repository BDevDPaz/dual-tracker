import type { DomainStatus, IntegrityClass } from "../../contracts/domain";
import type { EngineState } from "../../../components/ui/OperationalHeroCard";
import type { StatusType } from "../../../components/ui/StatusPill";
import type { BadgeType } from "../../../components/ui/IntegrityBadge";

/**
 * ============================================================================
 * uiMappings — puente de nomenclatura entre el dominio canónico
 * (DomainStatus / IntegrityClass, en español, definidos en
 * src/core/contracts/domain.ts) y los tipos de props que ya esperan los
 * componentes visuales reutilizados de src/components/ui (en inglés,
 * heredados del linaje W Tracker/LEDTracker: `EngineState`, `StatusType`,
 * `BadgeType`).
 *
 * Ningún componente visual se reescribe para esta capa — la Propuesta de la
 * capa app exige reutilizar OperationalHeroCard, SystemHealthBlock,
 * StatusPill e IntegrityBadge tal cual existen. Estas funciones puras son el
 * único lugar donde ambas nomenclaturas se tocan.
 * ============================================================================
 */

/** DomainStatus (7 estados, dominio) -> EngineState (prop de OperationalHeroCard/SystemHealthBlock). */
export function toEngineState(domainStatus: DomainStatus | null): EngineState {
  switch (domainStatus) {
    case null:
    case "NO_INICIADA":
      return "IDLE";
    case "GEOFENCE_CREATED":
      return "GEOFENCE_CREATED";
    case "TRASLADO":
      return "TRAVEL";
    case "ACTIVA":
      return "ACTIVE_WORK";
    case "PAUSADA":
      return "PAUSED";
    case "PENDING_EXIT_CONFIRMATION":
      return "PENDING_EXIT_CONFIRMATION";
    case "CERRADA":
      return "CLOSED";
    default:
      return "IDLE";
  }
}

/** Etiqueta corta en español para el estado operativo, uso en subtítulos/listas. */
export function domainStatusLabel(domainStatus: DomainStatus): string {
  switch (domainStatus) {
    case "NO_INICIADA":
      return "Sin iniciar";
    case "GEOFENCE_CREATED":
      return "Esperando llegada";
    case "TRASLADO":
      return "En tránsito";
    case "ACTIVA":
      return "Jornada activa";
    case "PAUSADA":
      return "En almuerzo";
    case "PENDING_EXIT_CONFIRMATION":
      return "Salida detectada";
    case "CERRADA":
      return "Cerrada";
    default:
      return "Desconocido";
  }
}

/** DomainStatus -> StatusType (prop de StatusPill en Historial/listas). */
export function toStatusPillType(domainStatus: DomainStatus): StatusType {
  switch (domainStatus) {
    case "ACTIVA":
      return "ACTIVE_WORK";
    case "CERRADA":
      return "CLOSED";
    case "PENDING_EXIT_CONFIRMATION":
      return "warning";
    case "TRASLADO":
      return "info";
    case "GEOFENCE_CREATED":
    case "PAUSADA":
      return "pending";
    default:
      return "pending";
  }
}

/** IntegrityClass -> BadgeType (prop de IntegrityBadge). */
export function toIntegrityBadgeType(integrityClass: IntegrityClass): BadgeType {
  switch (integrityClass) {
    case "VALID":
      return "valid";
    case "MANUAL":
      return "manual";
    case "AUTO":
      return "auto";
    case "CONFLICT":
      return "error";
    default:
      return "warning";
  }
}
