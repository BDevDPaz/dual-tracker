/** Decisiones del alta (PR-A): ubicación precisa, subpasos, avisos reales y recordatorio. */
import { getDisclosureContent } from "../../i18n/legal";
import { es } from "../../i18n/es";
import {
  backgroundBundleActive,
  clockIs24Hour,
  disclosureSections,
  formatReminderClock,
  homeBannerSettingsTarget,
  homeOptionalBanners,
  lockedRateAmount,
  nameNeedsError,
  permissionSubsteps,
  preciseLocationOk,
  readyHeadline,
  readyRows,
  stepReminderTime,
  substepIndex,
} from "../flow";

const base = {
  platform: "android",
  apiLevel: 34,
  foreground: "granted" as const,
  accuracy: "fine" as const,
  background: "granted" as const,
  battery: "unrestricted" as const,
  notifications: "granted" as const,
};

describe("ubicación precisa", () => {
  test("concedida y fine cuenta; la aproximada no", () => {
    expect(preciseLocationOk("granted", "fine")).toBe(true);
    expect(preciseLocationOk("granted", "n/a")).toBe(true);
    expect(preciseLocationOk("granted", "coarse")).toBe(false);
    expect(preciseLocationOk("granted", "unknown")).toBe(false);
    expect(preciseLocationOk("denied", "fine")).toBe(false);
    expect(preciseLocationOk("blocked", "coarse")).toBe(false);
  });
});

describe("subpasos de permisos", () => {
  test("Android 13+ tiene tres; Android 12 o menor omite notificaciones", () => {
    expect(permissionSubsteps("android", 34)).toEqual(["fine", "background", "notifications"]);
    expect(permissionSubsteps("android", 33)).toEqual(["fine", "background", "notifications"]);
    expect(permissionSubsteps("android", 32)).toEqual(["fine", "background"]);
    expect(permissionSubsteps("android", 31)).toEqual(["fine", "background"]);
    expect(permissionSubsteps("ios", null)).toEqual(["fine", "background", "notifications"]);
    expect(permissionSubsteps("android", null)).toEqual(["fine", "background", "notifications"]);
  });

  test("el foco abre el subpaso pedido sin volver a exigir el primero", () => {
    const steps = permissionSubsteps("android", 34);
    expect(substepIndex(steps, "background")).toBe(1);
    expect(substepIndex(steps, "fine")).toBe(0);
    expect(substepIndex(steps, "notifications")).toBe(2);
    expect(substepIndex(permissionSubsteps("android", 32), "notifications")).toBe(0);
  });
});

describe("segundo plano y batería", () => {
  test("en Android hacen falta los dos; en iOS la batería no cuenta", () => {
    expect(backgroundBundleActive({ platform: "android", background: "granted", battery: "unrestricted" })).toBe(true);
    expect(backgroundBundleActive({ platform: "android", background: "granted", battery: "restricted" })).toBe(false);
    expect(backgroundBundleActive({ platform: "android", background: "denied", battery: "unrestricted" })).toBe(false);
    expect(backgroundBundleActive({ platform: "ios", background: "granted", battery: "restricted" })).toBe(true);
    expect(backgroundBundleActive({ platform: "ios", background: "denied", battery: "n/a" })).toBe(false);
  });

  test("el aviso de Hoy solo sale si el sistema confirma que falta", () => {
    expect(homeOptionalBanners(base)).toEqual([]);
    expect(homeOptionalBanners({ ...base, background: "unknown", notifications: "unknown", battery: "unknown" })).toEqual([]);
    expect(homeOptionalBanners({ ...base, background: "denied", notifications: "blocked", battery: "restricted" })).toEqual([
      "background",
      "battery",
      "notifications",
    ]);
    expect(homeOptionalBanners({ ...base, platform: "ios", battery: "restricted", notifications: "denied" })).toEqual(["notifications"]);
    expect(homeBannerSettingsTarget("background")).toBe("LOCATION");
    expect(homeBannerSettingsTarget("battery")).toBe("BATTERY");
    expect(homeBannerSettingsTarget("notifications")).toBe("NOTIFICATIONS");
  });
});

describe("listo", () => {
  test("el visto del recordatorio solo si las notificaciones están concedidas", () => {
    const rows = readyRows(base);
    expect(rows.find((row) => row.id === "reminder")?.ok).toBe(true);
    expect(rows.find((row) => row.id === "rate")?.kind).toBe("info");
    const pending = readyRows({ ...base, notifications: "denied", background: "blocked" });
    expect(pending.find((row) => row.id === "reminder")?.ok).toBe(false);
    expect(pending.find((row) => row.id === "notifications")?.ok).toBe(false);
    expect(pending.find((row) => row.id === "background")?.ok).toBe(false);
    expect(readyHeadline(rows)).toBe("onboarding.readyTitle");
    expect(readyHeadline(pending)).toBe("onboarding.readyAlmost");
  });

  test("la aproximada no pinta un visto en ubicación precisa", () => {
    const rows = readyRows({ ...base, accuracy: "coarse" });
    expect(rows.find((row) => row.id === "fine")?.ok).toBe(false);
    expect(readyHeadline(rows)).toBe("onboarding.readyAlmost");
  });

  test("la fila de notificaciones sigue el estado real aunque el paso del alta no se muestre", () => {
    const rows = readyRows({ ...base, notifications: "granted" });
    expect(rows.some((row) => row.id === "notifications")).toBe(true);
    expect(rows.find((row) => row.id === "reminder")?.ok).toBe(true);
  });
});

describe("perfil", () => {
  test("el nombre pide al menos 2 caracteres y la tarifa se muestra bloqueada", () => {
    expect(nameNeedsError("")).toBe(true);
    expect(nameNeedsError(" ")).toBe(true);
    expect(nameNeedsError("A")).toBe(true);
    expect(nameNeedsError("Ana")).toBe(false);
    expect(lockedRateAmount(25)).toBe("25.00");
    expect(lockedRateAmount(Number.NaN)).toBe("0.00");
  });

  test("el recordatorio salta de 15 en 15 y usa AM/PM solo en 12 h", () => {
    expect(stepReminderTime("07:00", 1)).toBe("07:15");
    expect(stepReminderTime("07:00", -1)).toBe("06:45");
    expect(stepReminderTime("00:00", -1)).toBe("23:45");
    expect(stepReminderTime("23:45", 1)).toBe("00:00");
    expect(stepReminderTime("nope", 1)).toBe("07:15");
    expect(formatReminderClock("07:00", false)).toBe("7:00 AM");
    expect(formatReminderClock("15:30", false)).toBe("3:30 PM");
    expect(formatReminderClock("00:15", false)).toBe("12:15 AM");
    expect(formatReminderClock("07:00", true)).toBe("07:00");
    expect(clockIs24Hour("h23", "3 PM")).toBe(true);
    expect(clockIs24Hour("h12", "15")).toBe(false);
    expect(clockIs24Hour(undefined, "15")).toBe(true);
    expect(clockIs24Hour(undefined, "3 PM")).toBe(false);
  });
});

describe("aviso", () => {
  test("los bloques legales quedan en tres grupos sin perder ni inventar frases", () => {
    const content = getDisclosureContent("es");
    const sections = disclosureSections(content.blocks);
    expect(sections.map((section) => section.id)).toEqual(["during", "retention", "purpose"]);
    const shown = sections.flatMap((section) => section.items.map((item) => item.key));
    expect(shown.sort()).toEqual(content.blocks.map((block) => block.key).sort());
    expect(sections[1]?.items[0]?.body).toContain("90 días");
    expect(sections.flatMap((section) => section.items.map((item) => item.body)).join("\n")).toBe(
      content.blocks.map((block) => block.body).join("\n"),
    );
  });

  test("el copy de estructura no promete overlay ni que al tocar se abre la app", () => {
    const blob = JSON.stringify(es.onboarding);
    expect(blob).not.toContain("Al tocar se abre Dual Tracker");
    expect(blob).not.toContain("SYSTEM_ALERT_WINDOW");
    expect(blob.toLowerCase()).not.toContain("no funcionará como fue diseñada");
  });
});
