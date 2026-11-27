/**
 * H-13 y H-14: un deep link no se salta el alta ni el aviso.
 * En `a975910` (pila raíz sin guard) `/history` pintaba Historial con
 * `onboardingCompleted: false` y `COMPLETE_ONBOARDING` aceptaba un nombre
 * vacío sin aviso; ver PR. Aquí se monta la pila raíz real (`RootStack`) y el
 * gate real (`app/index.tsx`); las pantallas son marcadores.
 */
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Store, StoreActions } from "../../core/store";
import { t } from "../../i18n";
import { routeIntent } from "../../services/application/intentRouter";
import { ROUTES, hydrateWith } from "./gateRoutes";

describe("Deep links y gate (H-13)", () => {
  test("sin alta, /history y /session/1 vuelven al gate → bienvenida", async () => {
    await hydrateWith({ onboarded: false, accepted: false });
    const r = renderRouter(ROUTES, { initialUrl: "/history" });
    expect(await screen.findByText("BIENVENIDA")).toBeTruthy();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
    r.unmount();
    const s = renderRouter(ROUTES, { initialUrl: "/session/1" });
    expect(await screen.findByText("BIENVENIDA")).toBeTruthy();
    expect(screen.queryByText("DETALLE")).toBeNull();
    s.unmount();
  });

  test("alta hecha pero aviso vigente sin aceptar: /history → aviso", async () => {
    await hydrateWith({ onboarded: true, accepted: false });
    const r = renderRouter(ROUTES, { initialUrl: "/history" });
    expect(await screen.findByText("AVISO")).toBeTruthy();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
    r.unmount();
  });

  test("antes de hidratar, /history espera en el gate (hidratando)", async () => {
    act(() => StoreActions.bootStarted());
    const r = renderRouter(ROUTES, { initialUrl: "/history" });
    expect(await screen.findByText("HIDRATANDO")).toBeTruthy();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
    r.unmount();
  });

  test("sin regresión: con alta y aviso, el deep link entra y «/» lleva a Hoy", async () => {
    await hydrateWith({ onboarded: true, accepted: true });
    const r = renderRouter(ROUTES, { initialUrl: "/history" });
    expect(await screen.findByText("HISTORIAL")).toBeTruthy();
    r.unmount();
    const home = renderRouter(ROUTES, { initialUrl: "/" });
    expect(await screen.findByText("HOY")).toBeTruthy();
    home.unmount();
  });

});

describe("Listo por deep link (H-13 + H-14)", () => {
  test("/ready sin parámetros ni nombre guardado no completa el alta y vuelve a Perfil", async () => {
    await hydrateWith({ onboarded: false, accepted: true });
    const base = Store.getState().settings;
    act(() => StoreActions.settingsReplaced({ ...base, profile: { ...base.profile, employeeName: "" } }));
    renderRouter(ROUTES, { initialUrl: "/ready" });
    fireEvent.press(await screen.findByText(t("onboarding.readyStart")));
    expect(await screen.findByText("PERFIL")).toBeTruthy();
    expect(Store.getState().settings.device.onboardingCompleted).toBe(false);
  });

  test("/ready con nombre pero sin aviso aceptado vuelve al aviso", async () => {
    await hydrateWith({ onboarded: false, accepted: false });
    renderRouter(ROUTES, { initialUrl: "/ready?name=Byron" });
    fireEvent.press(await screen.findByText(t("onboarding.readyStart")));
    expect(await screen.findByText("AVISO")).toBeTruthy();
    expect(Store.getState().settings.device.onboardingCompleted).toBe(false);
  });

  test("/ready con nombre y aviso completa el alta y abre Hoy", async () => {
    await hydrateWith({ onboarded: false, accepted: true });
    renderRouter(ROUTES, { initialUrl: "/ready?name=Byron" });
    fireEvent.press(await screen.findByText(t("onboarding.readyStart")));
    await waitFor(() => expect(Store.getState().settings.device.onboardingCompleted).toBe(true));
    expect(await screen.findByText("HOY")).toBeTruthy();
  });
});

describe("COMPLETE_ONBOARDING (H-14)", () => {
  const profile = { hourlyRate: 25, language: "es" as const, dailyReminderTime: "07:00" };
  test("rechaza un nombre vacío o de una letra", async () => {
    await hydrateWith({ onboarded: false, accepted: true });
    expect(await routeIntent({ type: "COMPLETE_ONBOARDING", profile: { ...profile, employeeName: "" } })).toMatchObject({ ok: false, code: "NAME_REQUIRED" });
    expect(await routeIntent({ type: "COMPLETE_ONBOARDING", profile: { ...profile, employeeName: " B " } })).toMatchObject({ ok: false, code: "NAME_REQUIRED" });
    expect(Store.getState().settings.device.onboardingCompleted).toBe(false);
  });
  test("rechaza si el aviso vigente no está aceptado", async () => {
    await hydrateWith({ onboarded: false, accepted: false });
    expect(await routeIntent({ type: "COMPLETE_ONBOARDING", profile: { ...profile, employeeName: "Byron" } })).toMatchObject({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
    expect(Store.getState().settings.device.onboardingCompleted).toBe(false);
  });
  test("con nombre y aviso, completa", async () => {
    await hydrateWith({ onboarded: false, accepted: true });
    expect(await routeIntent({ type: "COMPLETE_ONBOARDING", profile: { ...profile, employeeName: "Byron" } })).toMatchObject({ ok: true });
    expect(Store.getState().settings.device.onboardingCompleted).toBe(true);
  });
});
