/**
 * Caso de uso: confirmar salida (Propuesta Técnica §7.1, flujo "Salida detectada").
 *   SALIDA → el usuario confirma → CLOSE_DAY(EXIT_CONFIRMED). La hora de cierre
 *   es la PRIMERA salida (lo aplica sessionMachine), no la hora del toque.
 *   La deducción de almuerzo llega del LunchModal (null = desconocida → la
 *   nómina emite LUNCH_DURATION_UNKNOWN en vez de asumir 60 min).
 */
import type { IntentOrigin } from "../../../core/contracts";
import { SessionEngineService } from "../../domain/SessionEngineService";

export async function confirmExit(lunchDeductedMinutes: number | null | undefined, origin: IntentOrigin = "UI") {
  return SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "EXIT_CONFIRMED", lunchDeductedMinutes: lunchDeductedMinutes ?? null }, origin);
}
