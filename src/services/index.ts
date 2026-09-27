/**
 * Catálogo canónico de servicios — Dual Tracker (Propuesta Técnica §6)
 * ============================================================================
 * 23 servicios agrupados por capa (§3):
 *
 *  Dominio      (domain/)       SessionEngine, PayrollEngine, IntegrityLedger,
 *                               SiteRegistry, TransitPolicy, ConcurrencyGuard,
 *                               DualDisclosure
 *  Evidencia    (evidence/)     TimeAuthority, TraceRecorder, EvidencePack,
 *                               Report (+ HashChain)
 *  Runtime / OS (runtime/)      GeofenceRuntime, TaskOrchestrator,
 *                               ForegroundWork, PermissionsHealth,
 *                               Notification, Security (+ tasks/)
 *  Persistencia (persistence/)  Persistence, Settings, Logging, OfflineQueue,
 *                               FieldCrypto
 *  Aplicación   (application/)  Feedback (+ useCases/, intentRouter)
 *
 * Reglas de dependencia (§2):
 *  - app/ NO importa este archivo: usa src/core/hooks/useWorkTracker.
 *  - Solo SessionEngine muta el ciclo de vida de la jornada.
 *  - Dominio no importa Runtime: los efectos salen por puertos inyectados en
 *    src/core/boot.ts (SessionEngineService.setRuntimePorts, TraceRecorder.setSink,
 *    SiteRegistry.setGeocoder).
 *  - Solo TimeAuthority lee el reloj del sistema.
 */

// Dominio
export { SessionEngineService } from "./domain/SessionEngineService";
export { PayrollEngineService } from "./domain/PayrollEngineService";
export { IntegrityLedgerService } from "./domain/IntegrityLedgerService";
export { SiteRegistryService } from "./domain/SiteRegistryService";
export { TransitPolicyService } from "./domain/TransitPolicyService";
export { ConcurrencyGuardService } from "./domain/ConcurrencyGuardService";
export { DualDisclosureService } from "./domain/DualDisclosureService";

// Evidencia
export { TimeAuthorityService } from "./evidence/TimeAuthorityService";
export { TraceRecorderService } from "./evidence/TraceRecorderService";
export { EvidencePackService } from "./evidence/EvidencePackService";
export { ReportService } from "./evidence/ReportService";

// Runtime / OS
export { GeofenceRuntimeService } from "./runtime/GeofenceRuntimeService";
export { TaskOrchestratorService } from "./runtime/TaskOrchestratorService";
export { ForegroundWorkService } from "./runtime/ForegroundWorkService";
export { PermissionsHealthService } from "./runtime/PermissionsHealthService";
export { NotificationService } from "./runtime/NotificationService";
export { SecurityService } from "./runtime/SecurityService";

// Persistencia
export { PersistenceService } from "./persistence/PersistenceService";
export { SettingsService } from "./persistence/SettingsService";
export { LoggingService } from "./persistence/LoggingService";
export { OfflineQueueService } from "./persistence/OfflineQueueService";
// FieldCryptoService NO se reexporta: solo persistence/** y core/boot.ts lo importan (spec v1.3 §17).

// Aplicación
export { FeedbackService } from "./application/FeedbackService";
export { routeIntent } from "./application/intentRouter";
