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
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { siteMinutesFromSession } from "../domain/siteMinutes";
import { TimeAuthorityService } from "./TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";
import { noteMockedFix } from "../runtime/mockLocationNotice";
import { trailPointPhase } from "./retentionRules";

/** Muestra cruda que entrega el runtime (tarea BREADCRUMB). */
export interface RawLocationSample {
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  altitudeM: number | null;
  timestampMs: number;
  source: SpatialSource;
  /** Android `LocationObject.mocked`. Ausente en muestras viejas. */
  mocked?: boolean;
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

  /**
   * Perfil de muestreo para ForegroundWork (null = no muestrear).
   * PAUSADA usa el perfil de espera para que el servicio siga vivo, pero
   * shouldRecord sigue en false: no se guardan migas del almuerzo.
   * Batería baja alarga el intervalo (no el de distancia).
   */
  profileFor(status: SessionRecordStatus | "NO_INICIADA", mode: TraceMode, battery?: number | null) {
    let profile: { timeIntervalMs: number; distanceIntervalM: number } | null = null;
    if (status === "TRASLADO") profile = BREADCRUMB_PROFILES.IN_TRANSIT;
    else if (status === "ACTIVA") profile = mode === "BREADCRUMB" ? BREADCRUMB_PROFILES.ON_SITE : BREADCRUMB_PROFILES.WAITING;
    else if (status === "ESPERANDO" || status === "SALIDA" || status === "PAUSADA") profile = BREADCRUMB_PROFILES.WAITING;
    if (!profile) return null;
    if (battery === null || battery === undefined || battery >= 0.35) return profile;
    const factor = battery < 0.2 ? 3 : 2;
    return { timeIntervalMs: profile.timeIntervalMs * factor, distanceIntervalM: profile.distanceIntervalM };
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
      const mocked = s.mocked === true;
      if (mocked) await noteMockedFix(session.id).catch(() => {});
      const unreliable = s.accuracyM === null || s.accuracyM > opts.radiusM;
      if (!record) {
        // Aun sin miga de pan se registra la pérdida de precisión como hecho de calidad.
        // Una lectura simulada también: sin coordenadas (el almuerzo y el perímetro
        // no guardan destino) pero el contador del expediente la ve.
        if ((unreliable || mocked) && session.domainStatus !== "PAUSADA") {
          await sink({
            sessionId: session.id,
            type: "ACCURACY_DROP",
            lat: null,
            lon: null,
            accuracyM: s.accuracyM,
            timestampMs: s.timestampMs,
            source: s.source,
            reliable: false,
            reason: mocked ? "MOCK_LOCATION" : "ACCURACY_GT_RADIUS",
            siteId: session.siteId,
            ...(mocked ? { mocked: true } : {}),
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
        reliable: mocked ? false : !unreliable,
        reason: mocked ? "MOCK_LOCATION" : unreliable ? "ACCURACY_GT_RADIUS" : null,
        siteId: session.siteId,
        speedMps: s.speedMps,
        altitudeM: s.altitudeM,
        battery: opts.battery,
        ...(mocked ? { mocked: true } : {}),
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
    const mockedFacts = facts.filter((f) => f.mocked === true || f.reason === "MOCK_LOCATION").length;
    return {
      sessionId: session.id,
      pointCount: crumbs.length,
      firstAtMs: crumbs[0]?.timestampMs ?? null,
      lastAtMs: crumbs[crumbs.length - 1]?.timestampMs ?? null,
      unreliableCount: facts.filter((f) => !f.reliable).length,
      ...(mockedFacts > 0 ? { mockedFacts } : {}),
      // El sitio sale de la jornada, no de la miga ni del enter/exit.
      dwellBySite: siteMinutesFromSession(session, TimeAuthorityService.now()),
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
   * Expurgo de miga de pan y ACCURACY_DROP. ENTER/EXIT se conservan.
   * Un punto sale solo si cada periodo sellado que lo cubre ya cumplió el
   * mínimo de días desde su fin. Sin expediente, no se borra.
   */
  async purgeExpired(retentionDays: number): Promise<number> {
    const now = TimeAuthorityService.now();
    const packs = (await PersistenceService.listPacks()).map((p) => ({
      periodStart: p.manifest.periodStart,
      periodEnd: p.manifest.periodEnd,
    }));
    const stamps = await PersistenceService.listTrailStamps();
    const ids = stamps.filter((s) => trailPointPhase(s.timestampMs, packs, now, retentionDays) === "ELIGIBLE").map((s) => s.id);
    if (!ids.length) return 0;
    const deleted = await PersistenceService.deleteSpatialFactsByIds(ids);
    if (deleted > 0) {
      await PersistenceService.transaction(async (db) => {
        await IntegrityLedgerService.append(
          {
            sessionId: null,
            actor: "SYSTEM",
            intent: "TRACE_PURGED",
            fromState: null,
            toState: null,
            reason: "RETENTION",
            timestampMs: now,
            integrityClass: null,
            data: { deleted, retentionDays },
          },
          db,
        );
      });
    }
    return deleted;
  },
};
