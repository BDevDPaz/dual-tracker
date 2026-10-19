/**
 * Registro de tareas headless en el ámbito global del bundle, antes de que
 * Expo Router evalúe React. Lo carga index.js (entry), no app/ (Producto §1).
 * TaskOrchestratorService.defineTasks es idempotente.
 *
 * El import de boot es dinámico: así este módulo puede evaluarse y llamar a
 * defineTask sin arrastrar el árbol de React en la evaluación inicial. La
 * tarea, cuando el SO la despierte, prepara SQLite y los puertos.
 */
import { TaskOrchestratorService } from "../TaskOrchestratorService";

TaskOrchestratorService.defineTasks(() => import("../../../core/boot").then((m) => m.ensureRuntimeReady()));
