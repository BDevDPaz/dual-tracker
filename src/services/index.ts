/**
 * ============================================================================
 * Barrel canónico — src/services
 * ----------------------------------------------------------------------------
 * Catálogo operativo de la Propuesta de Servicios Dual Tracker, sección 6
 * ("Catálogo canónico propuesto"). Un nombre, una responsabilidad, un
 * singleton exportado. Ningún otro módulo del dominio debe instanciar estas
 * clases directamente: siempre se importa el singleton desde aquí (o desde
 * el archivo puntual, que es equivalente).
 * ============================================================================
 */

// Dominio
export { sessionEngineService } from "./SessionEngineService";
export { payrollEngineService, CALIFORNIA_DAILY_OT_WEEKLY_40 } from "./PayrollEngineService";
export { integrityLedgerService } from "./IntegrityLedgerService";
export { siteRegistryService } from "./SiteRegistryService";
export { transitPolicyService } from "./TransitPolicyService";

// Evidencia
export { traceRecorderService } from "./TraceRecorderService";
export { timeAuthorityService } from "./TimeAuthorityService";
export { evidencePackService } from "./EvidencePackService";

// Runtime OS
export { geofenceRuntimeService } from "./GeofenceRuntimeService";
export { foregroundWorkService } from "./ForegroundWorkService";
export { taskOrchestratorService, TASK_INVENTORY } from "./TaskOrchestratorService";
export { permissionsHealthService } from "./PermissionsHealthService";
export { notificationService } from "./NotificationService";
export { reportService } from "./ReportService";

// Persistencia
export { persistenceService } from "./PersistenceService";

// Endurecimiento / soporte
export { securityService } from "./SecurityService";
export { dualDisclosureService } from "./DualDisclosureService";
export { concurrencyGuardService, ConcurrencyRejectedError } from "./ConcurrencyGuardService";
export { loggingService } from "./LoggingService";
export { feedbackService } from "./FeedbackService";
export { offlineQueueService } from "./OfflineQueueService";
export { fieldCryptoService } from "./FieldCryptoService";
