/** utils — geoUtils (Haversine), canonicalJson (estabilidad del hash), safeFileName, serializeError. */
import { canonicalJson } from "../canonicalJson";
import { getDistanceFromLatLonInMeters, isValidCoordinate } from "../geoUtils";
import { safeFileName } from "../safeFileName";
import { serializeError } from "../serializeError";

describe("geoUtils", () => {
  test("Haversine: LA → SF ≈ 559 km; mismo punto = 0; no finitos → NaN", () => {
    expect(getDistanceFromLatLonInMeters(34.0522, -118.2437, 37.7749, -122.4194) / 1000).toBeCloseTo(559, 0);
    expect(getDistanceFromLatLonInMeters(1, 1, 1, 1)).toBe(0);
    expect(getDistanceFromLatLonInMeters(NaN, 0, 0, 0)).toBeNaN();
  });
  test("isValidCoordinate", () => {
    expect(isValidCoordinate(34, -118)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(null, 0)).toBe(false);
    expect(isValidCoordinate("34", "-118")).toBe(false);
  });
});

describe("canonicalJson", () => {
  test("orden de claves indiferente, undefined omitido, arrays conservan orden", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: undefined } })).toBe('{"a":{"d":[2,1]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("safeFileName", () => {
  test("nombres de PDF seguros", () => {
    expect(safeFileName("DualTracker_Comprobante_W2026-09-21-abc", "pdf")).toBe("DualTracker_Comprobante_W2026-09-21-abc.pdf");
    expect(safeFileName("Nómina José / 2026", "pdf")).toBe("Nomina_Jose_2026.pdf");
    expect(safeFileName("../../etc/passwd", "p.d/f")).toBe("etc_passwd.pdf");
    expect(safeFileName("", "json")).toBe("artefacto.json");
    expect(safeFileName("x".repeat(200), "pdf")).toHaveLength(84);
  });
});

describe("serializeError", () => {
  test("primitivos, Error, objetos circulares", () => {
    expect(serializeError(null)).toBe("null");
    expect(serializeError(undefined)).toBe("undefined");
    expect(serializeError(3)).toBe("3");
    expect(serializeError("x")).toBe("x");
    expect(JSON.parse(serializeError(new Error("boom")))).toMatchObject({ name: "Error", message: "boom" });
    const o: Record<string, unknown> = { a: 1 };
    o.self = o;
    expect(serializeError(o)).toBe('{"a":1,"self":"[Circular]"}');
  });
});
