/**
 * TraceRecorderService — Evidencia (Propuesta Técnica §5.4, nuevo)
 * ============================================================================
 * La geocerca responde "¿dentro o fuera?"; el recorder responde "¿dónde
 * estuvo, con qué precisión y cada cuánto?".
 *  - Modo A (PERIMETER): solo ENTER/EXIT/DWELL (los escribe GeofenceRuntime).
 *  - Modo B (BREADCRUMB): muestreo adaptativo SOLO con status ACTIVA o
 *    TRASLADO (intervalo largo en sitio, frecuente en tránsito).
 *  - Nunca graba fuera de jornada ni en PAUSADA (almuerzo no rastrea destino
 *    personal).
 *  - Cada punto: lat, lon, accuracy, speed, altitude opcional, source,
 *    battery y timestamp canónico. Coordenadas selladas por FieldCrypto.
 *  - Retención configurable (company.traceRetentionDays).
 *
 * Es nuevo en Dual Tracker: GEOTrack solo tenía geocerca; el perfil de
 * muestreo proviene del startLocationUpdatesAsync de LEDTracker.
 */
import type {
  SessionRecord,
  SessionRecordStatus,
  SpatialFact,
  SpatialSource,
  TraceMode,
  TracePoint,
  TraceSummary,
} from "../../core/contracts";
import { BREADCRUMB_PROFILES } from "../../constants/geolocation";
import { getDistanceFromLatLonInMeters, isValidCoordinate } from "../../utils/geoUtils";
import { PersistenceService } from "../persistence/PersistenceService";
import { TimeAuthorityService } from "./TimeAuthorityService";

/** Muestra cruda que entrega el runtime (tarea BREADCRUMB). */
export interface RawLocationSample {
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  altitudeM: number | null;
  timestampMs: number;
  source: SpatialSource;
}

export type SpatialFactSink = (fact: SpatialFact & { speedMps?: number | null; altitudeM?: number | null; battery?: number | null }) => Promise<number>;

let sink: SpatialFactSink = (f) => PersistenceService.insertSpatialFact(f);

export const TraceRecorderService = {
  /** El sink real es SessionEngineService.recordSpatialFact (inyectado en boot). */
  setSink(s: SpatialFactSink | null): void {
    sink = s ?? ((f) => PersistenceService.insertSpatialFact(f));
  },

  /** ¿Se permite grabar miga de pan en este estado? */
  shouldRecord(status: SessionRecordStatus | "NO_INICIADA", mode: TraceMode): boolean {
    return mode === "BREADCRUMB" && (status === "ACTIVA" || status === "TRASLADO");
  },

  /** Perfil de muestreo para ForegroundWork (null = no muestrear). */
  profileFor(status: SessionRecordStatus | "NO_INICIADA", mode: TraceMode) {
    if (status === "TRASLADO") return BREADCRUMB_PROFILES.IN_TRANSIT;
    if (status === "ACTIVA") return mode === "BREADCRUMB" ? BREADCRUMB_PROFILES.ON_SITE : BREADCRUMB_PROFILES.WAITING;
    if (status === "ESPERANDO" || status === "SALIDA") return BREADCRUMB_PROFILES.WAITING;
    return null;
  },

  /**
   * Ingiere muestras de la tarea BREADCRUMB. Filtra por estado/modo y marca
   * ACCURACY_DROP cuando la precisión supera el radio del sitio.
   */
  async ingest(
    session: SessionRecord,
    samples: RawLocationSample[],
    opts: { mode: TraceMode; radiusM: number; battery: number | null },
  ): Promise<{ stored: number; skipped: number }> {
    let stored = 0;
    let skipped = 0;
    const record = TraceRecorderService.shouldRecord(session.domainStatus, opts.mode);
    for (const s of samples) {
      if (!isValidCoordinate(s.lat, s.lon)) {
        skipped++;
        continue;
      }
      const unreliable = s.accuracyM === null || s.accuracyM > opts.radiusM;
      if (!record) {
        // Aun sin miga de pan se registra la pérdida de precisión como hecho de calidad.
        if (unreliable && session.domainStatus !== "PAUSADA") {
          await sink({
            sessionId: session.id,
            type: "ACCURACY_DROP",
            lat: null,
            lon: null,
            accuracyM: s.accuracyM,
            timestampMs: s.timestampMs,
            source: s.source,
            reliable: false,
            reason: "ACCURACY_GT_RADIUS",
            siteId: session.siteId,
          });
          stored++;
        } else skipped++;
        continue;
      }
      const point: TracePoint = {
        sessionId: session.id,
        type: "BREADCRUMB",
        lat: s.lat,
        lon: s.lon,
        accuracyM: s.accuracyM,
        timestampMs: s.timestampMs,
        source: s.source,
        reliable: !unreliable,
        reason: unreliable ? "ACCURACY_GT_RADIUS" : null,
        siteId: session.siteId,
        speedMps: s.speedMps,
        altitudeM: s.altitudeM,
        battery: opts.battery,
      };
      await sink(point);
      stored++;
    }
    return { stored, skipped };
  },

  /** Puntos + hechos de una sesión (session/[id]/trace). */
  async listForSession(sessionId: number): Promise<SpatialFact[]> {
    return PersistenceService.listSpatialFacts(sessionId);
  },

  /** Resumen de traza para EvidencePack (no incluye puntos crudos). */
  async summarize(session: SessionRecord): Promise<TraceSummary> {
    const facts = await PersistenceService.listSpatialFacts(session.id);
    const crumbs = facts.filter((f) => f.type === "BREADCRUMB");
    const dwell = new Map<number | null, number>();
    for (let i = 1; i < crumbs.length; i++) {
      const prev = crumbs[i - 1];
      const key = prev.siteId ?? null;
      dwell.set(key, (dwell.get(key) ?? 0) + (crumbs[i].timestampMs - prev.timestampMs) / 60000);
    }
    return {
      sessionId: session.id,
      pointCount: crumbs.length,
      firstAtMs: crumbs[0]?.timestampMs ?? null,
      lastAtMs: crumbs[crumbs.length - 1]?.timestampMs ?? null,
      unreliableCount: facts.filter((f) => !f.reliable).length,
      dwellBySite: [...dwell.entries()].map(([siteId, minutes]) => ({ siteId, minutes: Math.round(minutes) })),
      enterExit: facts
        .filter((f): f is SpatialFact & { type: "ENTER" | "EXIT" } => f.type === "ENTER" || f.type === "EXIT")
        .map((f) => ({ type: f.type, timestampMs: f.timestampMs, reliable: f.reliable })),
    };
  },

  /** Distancia total recorrida (solo puntos fiables). Informativo para la vista de rastro. */
  distanceMeters(points: SpatialFact[]): number {
    let d = 0;
    const ok = points.filter((p) => p.type === "BREADCRUMB" && p.reliable && p.lat !== null && p.lon !== null);
    for (let i = 1; i < ok.length; i++) {
      const m = getDistanceFromLatLonInMeters(ok[i - 1].lat!, ok[i - 1].lon!, ok[i].lat!, ok[i].lon!);
      if (Number.isFinite(m)) d += m;
    }
    return Math.round(d);
  },

  /**
   * Expurgo por retención (tarea INTEGRITY_SWEEP). Solo miga de pan y
   * ACCURACY_DROP; ENTER/EXIT se conservan como evidencia de nómina.
   * TODO(política): "o hasta exportación del periodo" — hoy solo se aplica el plazo en días.
   */
  async purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = TimeAuthorityService.now() - retentionDays * 24 * 60 * 60 * 1000;
    return PersistenceService.purgeBreadcrumbsBefore(cutoff);
  },
};
