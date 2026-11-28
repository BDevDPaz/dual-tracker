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
  test("la versión sube a 2026-11-v4 y la aceptación de 2026-11-v3 ya no vale", () => {
    expect(DISCLOSURE_VERSION).toBe("2026-11-v4");
    const device = { ...DEFAULT_DEVICE_PREFS, onboardingCompleted: true, disclosureAcceptedVersion: "2026-11-v3" };
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

describe("B2 · textos v4 (es/en)", () => {
  const BLOCK_KEYS = [
    "perimeter",
    "breadcrumb",
    "lunch",
    "retention",
    "recipients",
    "purpose",
    "arrival",
    "autoClose",
    "control",
  ] as const;

  test("el resumen sigue siendo what, why y howLong; blocks termina en control", () => {
    for (const lang of ["es", "en"] as const) {
      const content = getDisclosureContent(lang);
      expect(content.summary.map((b) => b.key)).toEqual(["what", "why", "howLong"]);
      expect(content.blocks.map((b) => b.key)).toEqual([...BLOCK_KEYS]);
    }
  });

  test("textos exactos del resumen, del añadido de retención y destinatarios, y de control", () => {
    expect(summary("es", "what")).toBe(
      "Tu ubicación precisa y la hora mientras tienes una jornada abierta, incluso si la app está cerrada o no la estás usando. Sin jornada abierta no registramos tu ubicación. La única excepción es el botón «Estoy aquí» de la pantalla del destino, para fijar o mover el punto de un sitio: en ese momento la app lee tu ubicación, aunque no tengas jornada abierta. Durante el almuerzo o una pausa no se guardan puntos de rastro, aunque el servicio de ubicación siga activo.",
    );
    expect(summary("en", "what")).toBe(
      "Your precise location and the time while you have an open shift, even if the app is closed or you are not using it. Without an open shift we do not record your location. The only exception is the “I'm here” button on the site screen, to set or move a site point: at that moment the app reads your location, even without an open shift. During lunch or a pause no trail points are stored, even though the location service keeps running.",
    );
    expect(summary("es", "why")).toBe(
      "Para confirmar tus horas en el sitio de trabajo, registrar tus entradas y salidas, avisarte si sales sin cerrar la jornada y, si tu empresa activa el modo de rastro, guardar puntos de ubicación durante la jornada. Se usa para la nómina, no para vigilar tu vida personal. Tú y tu empleador ven el mismo registro.",
    );
    expect(summary("en", "why")).toBe(
      "To confirm your hours at the work site, record your entries and exits, alert you if you leave without closing the shift and, if your company enables trail mode, store location points during the shift. It is used for payroll, not to monitor your personal life. You and your employer see the same record.",
    );
    expect(summary("es", "howLong")).toBe(
      "Los datos se guardan en tu teléfono. Si tu empresa activa el portal del empleador, el expediente se envía por HTTPS al portal para que tu empleador lo vea. Los puntos de rastro se borran cuando el periodo de nómina ya se exportó y pasaron 90 días desde el fin de ese periodo (la empresa puede fijar otro plazo). Las entradas y salidas se conservan como registro de nómina.",
    );
    expect(summary("en", "howLong")).toBe(
      "The data is stored on your phone. If your company activates the employer portal, the record is sent over HTTPS to the portal so your employer can see it. Trail points are deleted once the payroll period has been exported and 90 days have passed since that period ended (your company can set a different period). Entries and exits are kept as the payroll record.",
    );
    expect(body("es", "retention")).toBe(
      "Los puntos de rastro se borran solo cuando el periodo de nómina que los contiene ya se exportó y, además, pasó el plazo que fije la empresa (por defecto 90 días) desde el fin de ese periodo. Las dos condiciones. Un periodo sin exportar no se borra. Los eventos de entrada y salida forman parte del expediente de nómina. Las entradas y salidas, los asientos y el expediente sellado se conservan como registro de nómina y no se borran.",
    );
    expect(body("en", "retention")).toBe(
      "Trail points are deleted only after the payroll period that contains them has been exported and the company retention period (90 days by default) has also passed since that period ended. Both conditions. An unexported period is never deleted. Entry and exit events are part of the payroll record. Entries and exits, ledger entries and the sealed pack are kept as the payroll record and are not deleted.",
    );
    expect(body("es", "recipients")).toBe(
      "El mismo expediente lo ven tú (comprobante) y tu empleador (expediente con integridad y rastro). Ambos pueden comparar el mismo código de verificación. No vendemos tu ubicación ni la compartimos con fines publicitarios. Tu empleador lo recibe cuando compartes o exportas el expediente, o por el portal del empleador si tu empresa lo activa.",
    );
    expect(body("en", "recipients")).toBe(
      "You (receipt) and your employer (dossier with integrity and trail) see the same record and can compare the same verification code. We do not sell your location or share it for advertising. Your employer receives it when you share or export the record, or through the employer portal if your company activates it.",
    );
    expect(getDisclosureContent("es").blocks.find((b) => b.key === "control")).toEqual({
      key: "control",
      title: "Tu control",
      body: "Puedes retirar tu consentimiento o repetir el alta desde este aviso o desde Ajustes. Al retirarlo no podrás usar la app hasta volver a aceptar el aviso y completar el alta; tus jornadas, expedientes y ajustes se conservan. Si no aceptas este aviso, no puedes completar el alta. Para retirar el consentimiento o repetir el alta, primero cierra la jornada si tienes una abierta.",
    });
    expect(getDisclosureContent("en").blocks.find((b) => b.key === "control")).toEqual({
      key: "control",
      title: "Your control",
      body: "You can withdraw your consent or repeat setup from this notice or from Settings. If you withdraw it, you won't be able to use the app until you accept the notice again and finish setup; your shifts, evidence packs and settings are kept. If you don't accept this notice, you can't finish setup. To withdraw consent or repeat setup, first close your shift if you have one open.",
    });
  });
});
