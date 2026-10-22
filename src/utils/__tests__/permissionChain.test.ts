/** Una petición que termina en "unknown" no bloquea la tarjeta siguiente. */
import { permissionCardEnabled } from "../permissionChain";

describe("permissionCardEnabled", () => {
  test("la primera tarjeta se habilita y busy apaga todas", () => {
    expect(permissionCardEnabled(null, false, false)).toBe(true);
    expect(permissionCardEnabled(null, false, true)).toBe(false);
    expect(permissionCardEnabled("granted", true, true)).toBe(false);
  });

  test("denied o granted abren la siguiente; unknown solo si ya se intentó", () => {
    expect(permissionCardEnabled("granted", false, false)).toBe(true);
    expect(permissionCardEnabled("denied", false, false)).toBe(true);
    expect(permissionCardEnabled("blocked", false, false)).toBe(true);
    expect(permissionCardEnabled("unknown", false, false)).toBe(false);
    expect(permissionCardEnabled("unknown", true, false)).toBe(true);
  });
});
