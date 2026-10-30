/**
 * Barrel de hooks de la capa Dual Tracker (servicios canónicos). Toda
 * pantalla bajo app/ que necesite datos de dominio (sesión activa, sitios,
 * historial, reportes, salud, conflicto, descargo o zona admin) importa
 * SOLO desde aquí -- nunca un servicio de src/services/* directamente.
 *
 * Para settings/onboarding/disclaimer flags/feedback en cola, la pantalla
 * sigue usando el hook legado `useWorkTracker` (src/core/hooks/useWorkTracker.ts)
 * y los selectores de src/core/selectors -- esa parte del sistema se
 * "conserva" tal cual, por diseño (Propuesta_Servicios_Dual_Tracker.docx §4.6).
 */
export * from "./uiMappings";
export * from "./useActiveSession";
export * from "./useSiteRegistry";
export * from "./useSessionHistory";
export * from "./useSessionDetail";
export * from "./useSessionTrace";
export * from "./useReportsCenter";
export * from "./useSystemHealth";
export * from "./useConflictResolution";
export * from "./useDisclosure";
export * from "./useAdminSecurity";
