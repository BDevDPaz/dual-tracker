/**
 * Reloj de pruebas. TimeAuthorityService lee Date.now() (pared) y
 * performance.now() (monótono); aquí ambos son controlables.
 *  - time.set(iso)      → fija la pared y re-ancla TimeAuthority (sin deriva).
 *  - time.travel(ms)    → avanza pared y monótono a la vez (sin deriva).
 *  - time.jumpWall(ms)  → salta SOLO la pared (simula cambio manual de hora → deriva).
 * Prohibido Date.now() suelto dentro de un test de nómina: usar time.now().
 */
import { TimeAuthorityService } from "../src/services/evidence/TimeAuthorityService";

export const FIXED_EPOCH_ISO = "2026-09-26T15:00:00.000Z";

const clock = { wall: Date.parse(FIXED_EPOCH_ISO), mono: 1_000_000 };

export function installClock(): void {
  Date.now = () => clock.wall;
  (globalThis as { performance: { now: () => number } }).performance = { now: () => clock.mono };
}

export const time = {
  now: (): number => clock.wall,
  set(iso: string | number): number {
    clock.wall = typeof iso === "number" ? iso : Date.parse(iso);
    TimeAuthorityService.reanchor();
    return clock.wall;
  },
  travel(ms: number): number {
    clock.wall += ms;
    clock.mono += ms;
    return clock.wall;
  },
  jumpWall(ms: number): number {
    clock.wall += ms;
    return clock.wall;
  },
  reset(): void {
    clock.wall = Date.parse(FIXED_EPOCH_ISO);
    clock.mono = 1_000_000;
    installClock();
    TimeAuthorityService.reanchor();
  },
};

export const MIN = 60_000;
export const HOUR = 60 * MIN;
