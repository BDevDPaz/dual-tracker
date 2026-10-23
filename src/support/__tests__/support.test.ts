/** Soporte: catálogo, consejos, práctica en memoria y diagnóstico sin datos sensibles. */
import { setLanguage, t } from "../../i18n";
import { allGuideKeys, tipsFor } from "../catalog";
import { SUPPORT_CONTENT_VERSION } from "../contentVersion";
import { readReleaseChannel } from "../buildLabel";
import { buildSupportDiagnostic, diagnosticIsSafe } from "../diagnostic";
import { formatVersionLine, settingsFooterLine } from "../versionLine";
import { PRACTICE_STORAGE_KEY, TIPS_STORAGE_KEY } from "../memory";
import { dispatchPractice, enterPractice, exitPractice, getPracticeSnapshot, reducePractice } from "../practice";
import { dismissTip, isTipDismissed, loadTips, resetTips } from "../tips";
import type { GeofenceDiagEvent, SettingsSnapshot, SystemHealthSnapshot } from "../../core/contracts";
import { createInitialState } from "../../core/store/initialState";

afterEach(() => setLanguage("es"));

describe("catálogo de soporte", () => {
  test("cada clave de guía, consejo, FAQ y glosario existe en es y en en", () => {
    const missing: string[] = [];
    for (const key of allGuideKeys()) {
      if (t(key, {}, "es") === key || t(key, {}, "en") === key) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  test("la versión viaja con el texto y el consejo de traslado es el acordado", () => {
    expect(SUPPORT_CONTENT_VERSION).toBe("soporte.v6");
    expect(t("support.tips.transferSameSession", {}, "es")).toBe(
      "¿Vas a otro destino? Usa Iniciar traslado y Confirmar llegada en la misma jornada para que se pague el traslado",
    );
    expect(t("support.practice.banner", {}, "es")).toBe("Modo práctica");
    expect(t("history.continuesUntil", { date: t("support.practice.nextMonday", {}, "es") }, "es")).toBe("continúa el lun");
  });

  test("el idioma vivo cambia el texto de la guía", () => {
    setLanguage("es");
    expect(t("support.flows.transfer.title")).toContain("Traslado");
    setLanguage("en");
    expect(t("support.flows.transfer.title")).toBe("Travel and several sites");
    expect(t("support.marks.continuesMonday")).toBe("continues on Mon");
  });
});

describe("consejos", () => {
  test("en traslado, con varios sitios, el consejo de la misma jornada va primero", () => {
    const ids = tipsFor({
      screen: "today",
      sessionState: "TRASLADO",
      siteCount: 2,
      batteryRestricted: false,
      provisionalSeal: false,
      hasSplitRow: false,
      hasZeroOmitted: false,
    });
    expect(ids[0]).toBe("transferSameSession");
  });

  test("se recuerda el descarte y Soporte puede volver a mostrarlo", async () => {
    await loadTips();
    expect(isTipDismissed("transferSameSession")).toBe(false);
    await dismissTip("transferSameSession");
    expect(isTipDismissed("transferSameSession")).toBe(true);
    await resetTips();
    expect(isTipDismissed("transferSameSession")).toBe(false);
  });
});

describe("práctica", () => {
  test("un recorrido completo no sale de la memoria de práctica", async () => {
    await enterPractice();
    expect((await dispatchPractice({ type: "START_MANUAL" })).ok).toBe(true);
    expect(getPracticeSnapshot().session?.phase).toBe("ESPERANDO");
    const blockedStart = await dispatchPractice({ type: "START_GEOFENCE" });
    expect(blockedStart.ok).toBe(false);
    if (!blockedStart.ok) expect(blockedStart.code).toBe("ALREADY_OPEN");
    expect((await dispatchPractice({ type: "SIMULATE_ENTER" })).ok).toBe(true);
    expect((await dispatchPractice({ type: "START_LUNCH" })).ok).toBe(true);
    expect((await dispatchPractice({ type: "RESUME" })).ok).toBe(true);
    expect((await dispatchPractice({ type: "START_TRANSFER" })).ok).toBe(true);
    expect((await dispatchPractice({ type: "CONFIRM_ARRIVAL" })).ok).toBe(true);
    expect(getPracticeSnapshot().session?.site).toBe("B");
    expect(getPracticeSnapshot().session?.transferArrived).toBe(true);
    expect((await dispatchPractice({ type: "DETECT_EXIT" })).ok).toBe(true);
    expect((await dispatchPractice({ type: "CLOSE_AUTO" })).ok).toBe(true);
    expect(getPracticeSnapshot().session?.integrity).toBe("AUTO");
    const blankNote = await dispatchPractice({ type: "EDIT_NOTE", note: "  " });
    expect(blankNote.ok).toBe(false);
    if (!blankNote.ok) expect(blankNote.code).toBe("NOTE_REQUIRED");
    expect((await dispatchPractice({ type: "EDIT_NOTE", note: "llegué tarde" })).ok).toBe(true);
    expect(getPracticeSnapshot().session?.integrity).toBe("MANUAL");
    expect((await dispatchPractice({ type: "SEAL" })).ok).toBe(true);
    expect(getPracticeSnapshot().session?.provisional).toBe(true);
    await exitPractice();
    expect(getPracticeSnapshot().active).toBe(false);
    expect(getPracticeSnapshot().session).toBeNull();
  });

  test("olvidé fichar exige nota y no abre una segunda jornada", () => {
    const missing = reducePractice(null, { type: "FORGOT_CLOCK", note: " " });
    expect(missing.code).toBe("NOTE_REQUIRED");
    const created = reducePractice(null, { type: "FORGOT_CLOCK", note: "no fiché" });
    expect(created.session?.forgot).toBe(true);
    expect(created.session?.integrity).toBe("MANUAL");
    expect(reducePractice(created.session, { type: "START_MANUAL" }).code).toBe("ALREADY_OPEN");
  });
});

describe("diagnóstico", () => {
  const base = createInitialState();

  test("omite nombre, tarifa, correo, coordenadas y sobres enc:v1", () => {
    const settings = {
      ...base.settings,
      profile: { ...base.settings.profile, employeeName: "Byron", hourlyRate: 44, language: "es" as const },
      company: { ...base.settings.company, employerName: "Acme", companyEmail: "b@acme.test" },
    } satisfies SettingsSnapshot;
    const event: GeofenceDiagEvent = {
      atMs: 10,
      kind: "ENTER",
      region: "SESSION_1_SITE_2",
      siteId: 2,
      accuracyM: 30,
      accepted: false,
      reason: "BACKGROUND_NOT_ALWAYS",
    };
    const health: SystemHealthSnapshot = {
      ...base.health,
      geofenceDiag: [Object.assign({}, event, { lat: 34.05, lon: -118.2 })],
    };
    const doc = buildSupportDiagnostic({
      nowMs: 10,
      appVersion: "1.0.0",
      releaseChannel: "",
      build: "dev",
      settings,
      health,
      tipsDismissed: ["transferSameSession"],
    });
    expect(diagnosticIsSafe(doc)).toBe(true);
    const json = JSON.stringify(doc);
    expect(json).not.toContain("Byron");
    expect(json).not.toContain("Acme");
    expect(json).not.toContain("acme.test");
    expect(json).not.toContain("34.05");
    expect(json).not.toContain("-118");
    expect(json).not.toContain("enc:v1");
    expect(json).not.toContain("hourlyRate");
    expect(doc.geofenceDiag[0].reason).toBe("BACKGROUND_NOT_ALWAYS");
    expect(doc.geofenceDiag[0].region).toBe("SESSION_1_SITE_2");
    expect(doc.contentVersion).toBe(SUPPORT_CONTENT_VERSION);
    expect(doc.releaseChannel).toBe("");
    expect(doc.versionLine).toBe("Versión 1.0.0 · build dev");
    expect("lat" in doc.geofenceDiag[0]).toBe(false);
  });

  test("RC1: la frase de versión coincide en español e inglés y entra en el JSON", () => {
    const health = base.health;
    const shared = {
      nowMs: 10,
      appVersion: "1.0.0",
      releaseChannel: "RC1",
      build: "4",
      health,
      tipsDismissed: [] as string[],
    };
    const esDoc = buildSupportDiagnostic({
      ...shared,
      settings: { ...base.settings, profile: { ...base.settings.profile, language: "es" } },
    });
    const enDoc = buildSupportDiagnostic({
      ...shared,
      settings: { ...base.settings, profile: { ...base.settings.profile, language: "en" } },
    });
    expect(esDoc.versionLine).toBe("Versión 1.0.0 (RC1) · build 4");
    expect(enDoc.versionLine).toBe("Version 1.0.0 (RC1) · build 4");
    expect(esDoc.releaseChannel).toBe("RC1");
    expect(formatVersionLine({ version: "1.0.0", channel: " RC1 ", build: "4", lang: "es" })).toBe(esDoc.versionLine);
    expect(formatVersionLine({ version: "1.0.0", channel: "RC1", build: "4", lang: "en" })).toBe(enDoc.versionLine);
    expect(JSON.stringify(esDoc)).toContain("Versión 1.0.0 (RC1) · build 4");
    expect(diagnosticIsSafe(esDoc)).toBe(true);
    expect(diagnosticIsSafe(enDoc)).toBe(true);
    expect(readReleaseChannel()).toBe("");
    expect(settingsFooterLine("es")).toMatch(/^Dual Tracker · v1\.0\.0 · build \S+(?: · [0-9a-f]{7})?$/i);
    expect(settingsFooterLine("en")).not.toContain("—");
  });

  test("el namespace de práctica no es la base SQLite", () => {
    expect(PRACTICE_STORAGE_KEY).toBe("dt.practice.v1");
    expect(TIPS_STORAGE_KEY.startsWith("dt.support.")).toBe(true);
    expect(PRACTICE_STORAGE_KEY).not.toContain("dual_tracker");
  });
});
