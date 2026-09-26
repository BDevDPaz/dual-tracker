/**
 * DualDisclosureService — Dominio (Propuesta Técnica §5.11, nuevo, legal de producto)
 * ============================================================================
 * Consentimiento y transparencia. Dual Tracker procesa ubicación laboral;
 * debe decirlo con precisión y limitar el alcance.
 *  - Descargo al primer uso: qué se graba, cuándo, cuánto tiempo y para qué.
 *  - Modo visible en UI: "Rastro activo" / "Solo geocerca" / "Sin ubicación".
 *  - Sin aceptación, no se inicia ESPERANDO (lo aplica sessionMachine).
 *  - Una versión nueva del texto vuelve a pedir aceptación ("política nueva").
 *
 * El contenido lo sirve este servicio a (onboarding)/disclosure.tsx y a
 * legal/disclosure.tsx para no divergir (Propuesta de Producto §5.17).
 */
import type {
  DevicePreferences,
  SessionRecordStatus,
  SystemHealthSnapshot,
  TraceMode,
  VisibleTrackingMode,
} from "../../core/contracts";
import { DISCLOSURE_VERSION, getDisclosureContent, getRetentionContent } from "../../i18n/legal";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { SettingsService } from "../persistence/SettingsService";

export const DualDisclosureService = {
  currentVersion(): string {
    return DISCLOSURE_VERSION;
  },

  /** Texto vigente del descargo (bloques) en el idioma pedido. */
  getContent(language: "es" | "en") {
    return getDisclosureContent(language);
  },

  /** Política de retención explicada (legal/retention.tsx). */
  getRetention(language: "es" | "en", retentionDays: number) {
    return getRetentionContent(language, retentionDays);
  },

  isAccepted(device: DevicePreferences): boolean {
    return device.disclosureAcceptedVersion === DISCLOSURE_VERSION;
  },

  /** Persiste la aceptación (intención ACCEPT_DISCLOSURE). */
  async accept(device: DevicePreferences, version: string): Promise<DevicePreferences | null> {
    if (version !== DISCLOSURE_VERSION) return null;
    const next: DevicePreferences = {
      ...device,
      disclosureAcceptedVersion: version,
      disclosureAcceptedAtMs: TimeAuthorityService.now(),
    };
    await SettingsService.saveDevice(next);
    return next;
  },

  /**
   * Modo visible de rastro. Nunca hay rastro fuera de jornada: con la sesión
   * en CERRADA / NO_INICIADA el modo es SIN_UBICACION (§12).
   */
  visibleMode(
    status: SessionRecordStatus | "NO_INICIADA",
    traceMode: TraceMode,
    health: SystemHealthSnapshot,
  ): VisibleTrackingMode {
    if (status === "NO_INICIADA" || status === "CERRADA") return "SIN_UBICACION";
    if (health.locationForeground !== "granted") return "SIN_UBICACION";
    if (traceMode === "BREADCRUMB" && (status === "ACTIVA" || status === "TRASLADO")) return "RASTRO_ACTIVO";
    return "SOLO_GEOCERCA";
  },
};
