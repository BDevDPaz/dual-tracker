/** Guía de permisos Android: batería, «todo el tiempo», Continuar y avisos. No bloquea el pago. */
import { t } from "../../i18n";
import {
  androidApiLevel,
  backgroundDegraded,
  batteryGuidance,
  continuePresentation,
  firstPendingIndex,
  guidanceForHealthSensor,
  isSamsungManufacturer,
  notificationGuidance,
  showAlwaysAllowGuidance,
  showBatteryCard,
  troubleGuidance,
} from "../permissionGuidance";

const unknown = {
  locationForeground: "unknown" as const,
  locationBackground: "unknown" as const,
  notifications: "unknown" as const,
};

describe("continuePresentation", () => {
  test("sin ningún permiso concedido el CTA es modo limitado y sigue disponible", () => {
    expect(continuePresentation(unknown)).toEqual({
      tone: "limited",
      labelKey: "onboarding.continueLimited",
      enabled: true,
    });
    expect(t("onboarding.continueLimited", {}, "es")).toBe("Continuar en modo limitado");
    expect(t("onboarding.continueLimited", {}, "en")).toBe("Continue in limited mode");
  });

  test("un permiso parcial cambia la etiqueta y no deshabilita Continuar", () => {
    expect(
      continuePresentation({
        locationForeground: "granted",
        locationBackground: "denied",
        notifications: "unknown",
      }),
    ).toEqual({ tone: "partial", labelKey: "onboarding.continuePartial", enabled: true });
    expect(t("onboarding.continuePartial", {}, "es")).toContain("Continuar");
    expect(t("onboarding.continuePartial", {}, "en")).toContain("Continue");
  });

  test("los tres concedidos usan Continuar", () => {
    expect(
      continuePresentation({
        locationForeground: "granted",
        locationBackground: "granted",
        notifications: "granted",
      }).labelKey,
    ).toBe("common.continue");
  });
});

describe("guía de segundo plano y notificaciones", () => {
  test("Android 11+ con solo primer plano explica «Permitir todo el tiempo» y abre ajustes", () => {
    expect(
      showAlwaysAllowGuidance({ platform: "android", apiLevel: 33, foreground: "granted", background: "denied" }),
    ).toBe(true);
    expect(
      showAlwaysAllowGuidance({ platform: "android", apiLevel: 30, foreground: "granted", background: "blocked" }),
    ).toBe(true);
    expect(
      showAlwaysAllowGuidance({ platform: "android", apiLevel: 29, foreground: "granted", background: "denied" }),
    ).toBe(false);
    expect(
      showAlwaysAllowGuidance({ platform: "ios", apiLevel: 33, foreground: "granted", background: "denied" }),
    ).toBe(false);
    expect(
      showAlwaysAllowGuidance({ platform: "android", apiLevel: 34, foreground: "denied", background: "denied" }),
    ).toBe(false);
    const guide = batteryGuidance({ platform: "android", battery: "restricted", samsung: true });
    expect(guide).not.toBeNull();
    const always = showAlwaysAllowGuidance({ platform: "android", apiLevel: null, foreground: "granted", background: "unknown" });
    expect(always).toBe(true);
    expect(t("onboarding.permBgAlwaysBody", {}, "es")).toContain("Permitir todo el tiempo");
    expect(t("onboarding.permBgAlwaysBody", {}, "en")).toContain("Allow all the time");
    expect(t("onboarding.permBgAlwaysBody", {}, "es").toLowerCase()).toContain("pago no cambia");
    expect(t("onboarding.permBgAlwaysBody", {}, "en").toLowerCase()).toContain("pay does not change");
  });

  test("notificaciones bloqueadas en Android 13+ indican Ajustes › Notificaciones", () => {
    expect(notificationGuidance({ platform: "android", apiLevel: 33, notifications: "blocked" })?.target).toBe("NOTIFICATIONS");
    expect(notificationGuidance({ platform: "android", apiLevel: 32, notifications: "blocked" })).toBeNull();
    expect(notificationGuidance({ platform: "android", apiLevel: 34, notifications: "denied" })).toBeNull();
    expect(notificationGuidance({ platform: "ios", apiLevel: 33, notifications: "blocked" })).toBeNull();
    expect(t("onboarding.permNotifBlockedBody", {}, "es")).toContain("Ajustes › Notificaciones");
    expect(t("onboarding.permNotifBlockedBody", {}, "en")).toContain("Settings › Notifications");
  });

  test("el banner degradado solo aparece si el segundo plano se negó o se bloqueó", () => {
    expect(backgroundDegraded("denied")).toBe(true);
    expect(backgroundDegraded("blocked")).toBe(true);
    expect(backgroundDegraded("unknown")).toBe(false);
    expect(backgroundDegraded("granted")).toBe(false);
  });
});

describe("batería Samsung / Android", () => {
  test("la tarjeta existe en Android y no en iOS, y no cuenta como concedida si está restringida", () => {
    expect(showBatteryCard({ platform: "android", battery: "restricted" })).toBe(true);
    expect(showBatteryCard({ platform: "android", battery: "unknown" })).toBe(true);
    expect(showBatteryCard({ platform: "android", battery: "unrestricted" })).toBe(true);
    expect(showBatteryCard({ platform: "ios", battery: "restricted" })).toBe(false);
    expect(showBatteryCard({ platform: "android", battery: "n/a" })).toBe(false);
    const samsung = batteryGuidance({ platform: "android", battery: "restricted", samsung: true });
    expect(samsung?.target).toBe("BATTERY");
    expect(samsung?.extraKeys).toContain("onboarding.permBatterySamsung");
    expect(batteryGuidance({ platform: "android", battery: "restricted", samsung: false })?.extraKeys).toEqual([]);
    expect(batteryGuidance({ platform: "android", battery: "unrestricted", samsung: true })).toBeNull();
    expect(t("onboarding.permBatteryBody", {}, "es").toLowerCase()).toContain("geocerca");
    expect(t("onboarding.permBatteryBody", {}, "es").toLowerCase()).toContain("pago no cambia");
    expect(t("onboarding.permBatteryBody", {}, "en").toLowerCase()).toContain("pay does not change");
  });

  test("reconoce Samsung por marca o fabricante", () => {
    expect(isSamsungManufacturer("samsung", "Samsung")).toBe(true);
    expect(isSamsungManufacturer("Samsung", null)).toBe(true);
    expect(isSamsungManufacturer(null, "samsung")).toBe(true);
    expect(isSamsungManufacturer("Google", "Google")).toBe(false);
    expect(isSamsungManufacturer(null, null)).toBe(false);
  });
});

describe("tarjeta pendiente y soporte", () => {
  test("la pendiente es la primera no concedida que ya se puede pulsar", () => {
    expect(firstPendingIndex(["granted", "denied", "unknown"], [true, true, false])).toBe(1);
    expect(firstPendingIndex(["granted", "granted", "granted"], [true, true, true])).toBe(-1);
    expect(firstPendingIndex(["unknown", "unknown", "unknown"], [true, false, false])).toBe(0);
  });

  test("Salud reutiliza la misma guía en segundo plano, avisos y batería", () => {
    const base = {
      platform: "android",
      apiLevel: 34,
      samsung: true,
      foreground: "granted" as const,
      background: "denied" as const,
      notifications: "blocked" as const,
      battery: "restricted" as const,
    };
    expect(guidanceForHealthSensor("locationBackground", base)?.target).toBe("LOCATION");
    expect(guidanceForHealthSensor("notifications", base)?.target).toBe("NOTIFICATIONS");
    expect(guidanceForHealthSensor("batteryOptimization", base)?.extraKeys).toContain("onboarding.permBatterySamsung");
    expect(guidanceForHealthSensor("clockDriftMs", base)).toBeNull();
  });

  test("Soporte reutiliza la misma guía en los problemas que ya hablan de permisos", () => {
    expect(troubleGuidance("permissionAlways")?.target).toBe("LOCATION");
    expect(troubleGuidance("permissionAlways")?.bodyKey).toBe("onboarding.permBgAlwaysBody");
    expect(troubleGuidance("samsungBattery")?.target).toBe("BATTERY");
    expect(troubleGuidance("samsungBattery")?.extraKeys).toContain("onboarding.permBatterySamsung");
    expect(troubleGuidance("notifications")?.target).toBe("NOTIFICATIONS");
    expect(troubleGuidance("commute")).toBeNull();
  });

  test("el nivel de API sale de Platform.Version en Android", () => {
    expect(androidApiLevel("android", 34)).toBe(34);
    expect(androidApiLevel("android", "33")).toBe(33);
    expect(androidApiLevel("ios", 17)).toBeNull();
    expect(androidApiLevel("android", "x")).toBeNull();
  });
});
