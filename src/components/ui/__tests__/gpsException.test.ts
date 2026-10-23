import { selectGpsExceptionKind } from "../gpsException";

const base = {
  sessionState: "ACTIVA" as const,
  clockDrift: false,
  integrityReason: null,
  gps: "ok" as const,
  monitoring: "MONITORING" as const,
};

describe("selectGpsExceptionKind", () => {
  test("sin jornada no hay excepción", () => {
    expect(selectGpsExceptionKind({ ...base, sessionState: "NO_INICIADA" })).toBeNull();
    expect(selectGpsExceptionKind({ ...base, sessionState: "CERRADA", gps: "lost" })).toBeNull();
  });

  test("la salida detectada es abandono de zona y gana a la deriva", () => {
    expect(selectGpsExceptionKind({ ...base, sessionState: "SALIDA", clockDrift: true })).toBe("zone_exit");
  });

  test("deriva de reloj es asincronía, sin cerrar la jornada", () => {
    expect(selectGpsExceptionKind({ ...base, clockDrift: true })).toBe("gps_async");
    expect(selectGpsExceptionKind({ ...base, integrityReason: "CLOCK_DRIFT" })).toBe("gps_async");
  });

  test("señal perdida es retraso; la espera fallida es no show", () => {
    expect(selectGpsExceptionKind({ ...base, gps: "lost" })).toBe("signal_delay");
    expect(selectGpsExceptionKind({ ...base, sessionState: "ESPERANDO", monitoring: "FAILED" })).toBe("no_show");
    expect(selectGpsExceptionKind({ ...base, sessionState: "ESPERANDO", gps: "ok", monitoring: "MONITORING" })).toBeNull();
  });
});
