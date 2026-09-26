/** Inventario de tareas OS (Propuesta Técnica §7.2). */
export { runGeofenceTask } from "./geofence.task";
export { runBreadcrumbTask } from "./breadcrumb.task";
export { runSessionWatchdog } from "./sessionWatchdog.task";
export { runExitDecisionTimer } from "./exitDecisionTimer.task";
export type { ExitDecisionDeadline } from "./exitDecisionTimer.task";
export { runDailyReminder } from "./dailyReminder.task";
export { runIntegritySweep } from "./integritySweep.task";
export { runPayrollExport } from "./payrollExport.task";
