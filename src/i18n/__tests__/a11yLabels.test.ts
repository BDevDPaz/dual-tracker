/** Etiquetas habladas y códigos internos traducidos. El valor guardado no cambia. */
import { setLanguage } from "..";
import { reminderTitleForHour, spokenDuration, tLedgerIntent, tPackFileRole, tReviewReason, tSpatialType } from "../labels";

afterEach(() => setLanguage("es"));

describe("etiquetas de accesibilidad", () => {
  test("la duración se dice en horas y minutos, con plural", () => {
    expect(spokenDuration("1h 5m", "es")).toBe("1 hora 5 minutos");
    expect(spokenDuration("2h 1m", "es")).toBe("2 horas 1 minuto");
    expect(spokenDuration("8h 0m", "en")).toBe("8 hours 0 minutes");
    expect(spokenDuration("1h 1m", "en")).toBe("1 hour 1 minute");
    expect(spokenDuration("01:00:00", "es")).toBe("01:00:00");
  });

  test("el recordatorio no dice buenos días por la tarde ni por la noche", () => {
    expect(reminderTitleForHour(8, "es")).toBe("Buenos días");
    expect(reminderTitleForHour(15, "es")).toBe("Buenas tardes");
    expect(reminderTitleForHour(21, "es")).toBe("Recordatorio de jornada");
    expect(reminderTitleForHour(8, "en")).toBe("Good morning");
    expect(reminderTitleForHour(15, "en")).toBe("Good afternoon");
    expect(reminderTitleForHour(21, "en")).toBe("Shift reminder");
  });

  test("tipos de traza, roles, motivos e intenciones no se muestran en crudo", () => {
    expect(tSpatialType("BREADCRUMB", "es")).toBe("Miga de pan");
    expect(tSpatialType("ENTER", "en")).toBe("Enter");
    expect(tSpatialType("NO_SUCH", "es")).not.toContain("NO_SUCH");
    expect(tPackFileRole("EMPLOYEE_PDF", "es")).toBe("Comprobante del empleado");
    expect(tPackFileRole("EMPLOYEE_RECEIPT", "en")).toBe("Employee receipt");
    expect(tReviewReason("OVERLAP", "es")).toBe("Se solapa con otra jornada");
    expect(tReviewReason("OVERLAP", "en")).not.toBe("OVERLAP");
    expect(tLedgerIntent("START_DAY", "es")).toBe("Jornada iniciada");
    expect(tLedgerIntent("START_DAY", "en")).not.toBe("START_DAY");
    expect(tLedgerIntent("NOT_A_REAL_INTENT", "es")).toBe("Evento registrado");
    expect(tLedgerIntent("NOT_A_REAL_INTENT", "en")).toBe("Recorded event");
    expect(tLedgerIntent("NOT_A_REAL_INTENT", "es")).not.toContain("NOT_A_REAL_INTENT");
  });
});
