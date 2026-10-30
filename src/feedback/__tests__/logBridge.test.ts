import { emitFeedbackFromLog, setFeedbackEmitter } from "../logBridge";

jest.mock("../../utils/timeProvider", () => ({
  now: () => 1000,
}));

describe("logBridge - Hardened", () => {
  let mockEmitter: jest.Mock;

  beforeEach(() => {
    mockEmitter = jest.fn();
    setFeedbackEmitter(mockEmitter);
    jest.clearAllMocks();
  });

  it("no debe emitir feedback para DEBUG o EVENT", () => {
    emitFeedbackFromLog("DEBUG", "ERROR_CRITICO", "Mensaje debug");
    emitFeedbackFromLog("EVENT", "ERROR_CRITICO", "Mensaje evento");
    expect(mockEmitter).not.toHaveBeenCalled();
  });

  it("no debe emitir feedback para categorías silenciosas", () => {
    emitFeedbackFromLog("INFO", "BACKGROUND_TASK", "Haciendo cosas");
    expect(mockEmitter).not.toHaveBeenCalled();
  });

  it("debe emitir feedback para ERROR_CRITICO", () => {
    emitFeedbackFromLog("ERROR", "ERROR_CRITICO", "Fallo total");
    expect(mockEmitter).toHaveBeenCalled();
  });

  it("debe sanitizar coordenadas en los mensajes", () => {
    emitFeedbackFromLog("WARN", "ADVERTENCIA", "Error en 19.4326, -99.1332");
    expect(mockEmitter).toHaveBeenCalled();
    const payload = mockEmitter.mock.calls[0][0];
    expect(payload.message).toContain("[UBICACIÓN]");
  });

  it("debe prevenir loops infinitos (isEmitting)", () => {
    const loopingEmitter = jest.fn((payload) => {
      // Intentar disparar otro feedback desde adentro del emisor
      if (payload.message === "Mensaje Original") {
        emitFeedbackFromLog("ERROR", "ERROR_CRITICO", "Mensaje Original");
      }
    });
    setFeedbackEmitter(loopingEmitter);

    emitFeedbackFromLog("ERROR", "ADVERTENCIA", "Mensaje Original");

    // Debería haberse llamado una sola vez
    expect(loopingEmitter).toHaveBeenCalledTimes(1);
  });

  it("debe aplicar throttling (deduplicación temporal)", () => {
    emitFeedbackFromLog("INFO", "OPERACION_EXITOSA", "Auto Check-in exitoso");
    emitFeedbackFromLog("INFO", "OPERACION_EXITOSA", "Auto Check-in exitoso");

    expect(mockEmitter).toHaveBeenCalledTimes(1);
  });
});
