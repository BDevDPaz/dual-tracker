/** H-12: las cinco ramas del gate `initialHref` (G1–G5) y la regla de `canEnterApp` (H-13). */
import { canEnterApp, initialHref } from "../initialRoute";

const ready = { hydrated: true, bootError: null, needsOnboarding: false, needsDisclaimer: false, hasConflict: false };

describe("initialHref", () => {
  test("G1 sin hidratar o con error de arranque → hidratando", () => {
    expect(initialHref({ ...ready, hydrated: false })).toBe("/(boot)/hydrating");
    expect(initialHref({ ...ready, bootError: "x" })).toBe("/(boot)/hydrating");
  });
  test("G2 alta sin completar → bienvenida (antes que el aviso y el conflicto)", () => {
    expect(initialHref({ ...ready, needsOnboarding: true })).toBe("/(onboarding)/welcome");
    expect(initialHref({ ...ready, needsOnboarding: true, needsDisclaimer: true, hasConflict: true })).toBe("/(onboarding)/welcome");
  });
  test("G3 alta hecha pero aviso vigente sin aceptar → aviso (antes que el conflicto)", () => {
    expect(initialHref({ ...ready, needsDisclaimer: true })).toBe("/(onboarding)/disclosure");
    expect(initialHref({ ...ready, needsDisclaimer: true, hasConflict: true })).toBe("/(onboarding)/disclosure");
  });
  test("G4 conflicto sin resolver → conflicto; G5 → pestañas", () => {
    expect(initialHref({ ...ready, hasConflict: true })).toBe("/system/conflict");
    expect(initialHref(ready)).toBe("/(tabs)");
  });
});

describe("canEnterApp", () => {
  test("solo con el alta completada y el aviso aceptado", () => {
    expect(canEnterApp({ needsOnboarding: false, needsDisclaimer: false })).toBe(true);
    expect(canEnterApp({ needsOnboarding: true, needsDisclaimer: false })).toBe(false);
    expect(canEnterApp({ needsOnboarding: false, needsDisclaimer: true })).toBe(false);
    expect(canEnterApp({ needsOnboarding: true, needsDisclaimer: true })).toBe(false);
  });
});

describe("initialHref · reanudación por marcador (H-1)", () => {
  const mid = { ...ready, needsOnboarding: true };
  test("con el aviso aceptado reanuda en el paso guardado", () => {
    expect(initialHref({ ...mid, onboardingStep: "permissions" })).toBe("/(onboarding)/permissions");
    expect(initialHref({ ...mid, onboardingStep: "profile" })).toBe("/(onboarding)/profile");
    expect(initialHref({ ...mid, onboardingStep: "ready" })).toBe("/(onboarding)/ready");
  });
  test("sin marcador → bienvenida (no se deduce de los datos)", () => {
    expect(initialHref({ ...mid, onboardingStep: null })).toBe("/(onboarding)/welcome");
    expect(initialHref(mid)).toBe("/(onboarding)/welcome");
  });
  test("con marcador pero sin el aviso vigente → aviso; nunca se salta el aviso", () => {
    expect(initialHref({ ...mid, needsDisclaimer: true, onboardingStep: "ready" })).toBe("/(onboarding)/disclosure");
  });
  test("con el alta completa el marcador no cuenta", () => {
    expect(initialHref({ ...ready, onboardingStep: "profile" })).toBe("/(tabs)");
  });
});
