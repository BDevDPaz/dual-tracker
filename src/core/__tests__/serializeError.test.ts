import { serializeError } from "../workTrackerEngine";

// Mock minimal para evitar que el motor explote al inicializarse
jest.mock("../../database/db", () => ({}));
jest.mock("../../feedback/logBridge", () => ({}));
jest.mock("../../utils/logger", () => ({}));
jest.mock("../../utils/timeProvider", () => ({
  now: jest.fn(() => 123456789),
  nowIso: jest.fn(() => "2026-07-07T08:00:00.000Z"),
}));
jest.mock("../state", () => ({
  createInitialState: jest.fn(() => ({})),
}));
jest.mock("../reducer", () => ({
  workTrackerReducer: jest.fn(),
}));
jest.mock("../effects", () => ({
  executeEffects: jest.fn(),
}));

describe("serializeError", () => {
  it("debe serializar null y undefined", () => {
    expect(serializeError(null)).toBe("null");
    expect(serializeError(undefined)).toBe("undefined");
  });

  it("debe serializar tipos primitivos", () => {
    expect(serializeError(true)).toBe("true");
    expect(serializeError(false)).toBe("false");
    expect(serializeError(123)).toBe("123");
    expect(serializeError(0)).toBe("0");
    expect(serializeError("hola")).toBe("hola");
  });

  it("debe serializar Error estándar", () => {
    const err = new Error("test message");
    err.name = "TestError";
    const serialized = serializeError(err);
    const parsed = JSON.parse(serialized);

    expect(parsed.name).toBe("TestError");
    expect(parsed.message).toBe("test message");
    expect(parsed.stack).toBeDefined();
  });

  it("debe serializar objetos simples", () => {
    const obj = { a: 1, b: "dos" };
    const serialized = serializeError(obj);
    expect(JSON.parse(serialized)).toEqual(obj);
  });

  it("debe manejar referencias circulares", () => {
    const obj: any = { a: 1 };
    obj.self = obj;

    const serialized = serializeError(obj);
    expect(serialized).toContain("[Circular]");
    const parsed = JSON.parse(serialized);
    expect(parsed.a).toBe(1);
    expect(parsed.self).toBe("[Circular]");
  });

  it("debe manejar errores en JSON.stringify (objetos que lanzan error al acceder a propiedades)", () => {
    const evilObj = {
      get a() {
        throw new Error("boom");
      },
    };

    const serialized = serializeError(evilObj);
    expect(serialized).toContain("[Serialization Error:");
    expect(serialized).toContain("boom");
  });

  it("debe manejar tipos desconocidos via String()", () => {
    const sym = Symbol("foo");
    expect(serializeError(sym)).toBe("Symbol(foo)");
  });
});
