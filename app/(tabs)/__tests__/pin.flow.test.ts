/** Ajustes: guardar el PIN local. Lo emite app/(tabs)/settings.tsx. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { SecurityService } from "../../../src/services/runtime/SecurityService";

describe("app/(tabs) PIN", () => {
  test("SETUP_ADMIN_PIN deja un PIN local que abre la zona", async () => {
    const set = await routeIntent({ type: "SETUP_ADMIN_PIN", pin: "654321" });
    expect(set.ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("LOCAL");
    expect((await SecurityService.unlock("654321")).ok).toBe(true);
    expect(SecurityService.isUnlocked()).toBe(true);
  });
});
