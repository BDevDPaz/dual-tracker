// --- src/utils/__tests__/dateUtils.test.ts ---
import { formatTime, formatDate, formatDuration } from "../dateUtils";

describe("dateUtils", () => {
  // ✅ Usamos Date.UTC para crear un timestamp absoluto e inmutable independiente del entorno.
  // 28 de Enero de 2026 a las 22:30:00 UTC.
  // En la zona corporativa configurada (America/Los_Angeles, PST UTC-8), esto equivale exactamente a las 14:30:00 (02:30 PM).
  const TEST_TIMESTAMP = Date.UTC(2026, 0, 28, 22, 30, 0);

  describe("formatTime", () => {
    it("debería formatear la hora respetando estrictamente la zona horaria corporativa (Los Ángeles)", () => {
      const result = formatTime(TEST_TIMESTAMP);
      // Ahora podemos afirmar con precisión exacta, sin regex difusos
      expect(result).toBe("02:30 PM");
    });

    it('debería retornar el fallback "--:--" para timestamps inválidos o nulos', () => {
      expect(formatTime(0)).toBe("--:--");
      expect(formatTime(null as any)).toBe("--:--");
    });
  });

  describe("formatDate", () => {
    it("debería formatear la fecha correctamente en español", () => {
      const result = formatDate(TEST_TIMESTAMP);
      // Day.js con locale 'es' produce variaciones como "mié., 28 ene. 2026".
      // Evaluamos los elementos clave para evitar fallos por signos de puntuación de la librería.
      const lowerResult = result.toLowerCase();
      expect(lowerResult).toContain("mié");
      expect(result).toContain("28");
      expect(lowerResult).toContain("ene");
      expect(result).toContain("2026");
    });

    it('debería retornar el fallback "---" para timestamps inválidos o nulos', () => {
      expect(formatDate(0)).toBe("---");
    });
  });

  describe("formatDuration", () => {
    it("debería convertir milisegundos a formato texto de horas y minutos (HHh MMm)", () => {
      // 8.5 horas = 30,600,000 milisegundos
      const ms = 30600000;
      const result = formatDuration(ms);
      expect(result).toBe("8h 30m");
    });

    it('debería retornar "0h 0m" si el input es 0 o un valor negativo (failsafe)', () => {
      expect(formatDuration(0)).toBe("0h 0m");
      expect(formatDuration(-15000)).toBe("0h 0m");
    });
  });
});
