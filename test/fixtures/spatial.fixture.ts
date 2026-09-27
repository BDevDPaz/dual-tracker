/** Fixtures de SpatialFact: makeEnter / makeExit / makeBreadcrumb. */
import type { SpatialFact, TracePoint } from "../../src/core/contracts";
import { MONDAY_8AM } from "./session.fixture";

/** Coordenadas del sitio de prueba (Los Ángeles). */
export const SITE_LAT = 34.0522;
export const SITE_LON = -118.2437;

type FactOpts = Partial<SpatialFact>;

function base(type: SpatialFact["type"], o: FactOpts): SpatialFact {
  return {
    sessionId: 1,
    type,
    lat: SITE_LAT,
    lon: SITE_LON,
    accuracyM: 10,
    timestampMs: MONDAY_8AM,
    source: "gps",
    reliable: true,
    reason: null,
    siteId: 1,
    ...o,
  };
}

export const makeEnter = (o: FactOpts = {}): SpatialFact => base("ENTER", o);
export const makeExit = (o: FactOpts = {}): SpatialFact => base("EXIT", o);

export function makeBreadcrumb(o: Partial<TracePoint> = {}): TracePoint {
  return { ...(base("BREADCRUMB", o) as TracePoint), speedMps: null, altitudeM: null, battery: null, ...o, type: "BREADCRUMB" };
}
