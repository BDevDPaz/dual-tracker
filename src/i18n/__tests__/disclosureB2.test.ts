/**
 * Solicitud 7, PR 3 (B2) — texto del aviso. TODO(legal): pendiente de revisión
 * por la asesoría legal; estos tests solo fijan que el texto dice lo que hace
 * el código, no su validez legal.
 */
import { DISCLOSURE_VERSION, getDisclosureContent } from "../legal";
import { DualDisclosureService } from "../../services/domain/DualDisclosureService";
import { DEFAULT_DEVICE_PREFS } from "../../services/persistence/SettingsService";

const all = (lang: "es" | "en") => {
  const c = getDisclosureContent(lang);
  return [c.title, ...c.summary.flatMap((b) => [b.title, b.body]), ...c.blocks.flatMap((b) => [b.title, b.body])].join("\n");
};
const body = (lang: "es" | "en", key: string) => getDisclosureContent(lang).blocks.find((b) => b.key === key)?.body ?? "";
const summary = (lang: "es" | "en", key: string) => getDisclosureContent(lang).summary.find((b) => b.key === key)?.body ?? "";

describe("B2 · versión", () => {
  test("la versión sube a 2026-11-v3 y la aceptación de 2026-10-v2 ya no vale", () => {
    expect(DISCLOSURE_VERSION).toBe("2026-11-v3");
    const device = { ...DEFAULT_DEVICE_PREFS, onboardingCompleted: true, disclosureAcceptedVersion: "2026-10-v2" };
    expect(DualDisclosureService.isAccepted(device)).toBe(false);
    expect(DualDisclosureService.isAccepted({ ...device, disclosureAcceptedVersion: DISCLOSURE_VERSION })).toBe(true);
  });
});

describe("B2 · la frase falsa no está", () => {
  test.each(["es", "en"] as const)("%s: no se promete abrir la jornada automáticamente", (lang) => {
    const text = all(lang).toLowerCase();
    expect(text).not.toMatch(/abrir tu jornada autom|abrimos tu jornada|abrir la jornada autom/);
    expect(text).not.toMatch(/open your shift automatically|open the shift automatically|we (can )?open your shift/);
  });

  test.each(["es", "en"] as const)("%s: sin jerga de código (geocerca, hash, ACTIVA, TRASLADO)", (lang) => {
    const text = all(lang);
    expect(text).not.toMatch(/geocerca|geofence|\bhash\b|\bACTIVA\b|\bTRASLADO\b/);
  });
});

describe("B2 · textos nuevos (es/en)", () => {
  test("llegada: la jornada la abre el usuario; con jornada abierta y app cerrada se puede registrar la llegada", () => {
    expect(body("es", "arrival")).toContain("La jornada no se abre sola: la abres tú");
    expect(body("es", "arrival")).toContain("con la app cerrada, la app puede registrar tu llegada");
    expect(body("en", "arrival")).toContain("The shift does not open by itself: you open it");
    expect(body("en", "arrival")).toContain("with the app closed, the app can record your arrival");
  });

  test("12 h: cierre automático con aviso y sus dos excepciones", () => {
    expect(body("es", "autoClose")).toContain("se cierra automáticamente al pasar 12 horas");
    expect(body("es", "autoClose")).toContain("si ampliaste la jornada o si ya está en revisión por posible abandono");
    expect(body("en", "autoClose")).toContain("closes automatically after 12 hours");
    expect(body("en", "autoClose")).toContain("if you extended the shift or if it is already under review for possible abandonment");
  });

  test("almuerzo/pausa: no se guardan puntos de rastro aunque el servicio siga activo", () => {
    for (const text of [body("es", "lunch"), summary("es", "what")]) {
      expect(text).toContain("no se guardan puntos de rastro, aunque el servicio de ubicación siga activo");
    }
    for (const text of [body("en", "lunch"), summary("en", "what")]) {
      expect(text).toContain("no trail points are stored, even though the location service keeps running");
    }
    expect(body("es", "lunch")).not.toContain("no se registra rastro");
    expect(body("en", "lunch")).not.toContain("No trail is recorded");
  });

  test("los tres bloques cortos llevan sus títulos", () => {
    expect(getDisclosureContent("es").summary.map((b) => b.title)).toEqual(["¿Qué registramos?", "¿Para qué?", "¿Cuánto tiempo se guarda?"]);
    expect(getDisclosureContent("en").summary.map((b) => b.title)).toEqual(["What do we record?", "What for?", "How long is it kept?"]);
  });
});
