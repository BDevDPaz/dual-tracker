/** Plano local: este positivo, norte positivo, norte arriba en pantalla. */
import { centroidOf, fitLocalPlane, niceScaleMeters, projectEquirectangular, toScreen } from "../localPlane";

describe("plano local", () => {
  const origin = { lat: 34, lon: -118 };

  test("el este crece en x y el norte en y", () => {
    const east = projectEquirectangular({ lat: 34, lon: -117.99 }, origin);
    const north = projectEquirectangular({ lat: 34.01, lon: -118 }, origin);
    expect(east.x).toBeGreaterThan(0);
    expect(Math.abs(east.y)).toBeLessThan(1);
    expect(north.y).toBeGreaterThan(0);
    expect(Math.abs(north.x)).toBeLessThan(1);
  });

  test("el norte queda más arriba en pantalla", () => {
    const points = [
      { lat: 34, lon: -118.01 },
      { lat: 34.01, lon: -118 },
    ];
    const originFit = centroidOf(points);
    expect(originFit).not.toBeNull();
    const fit = fitLocalPlane(points, 320, 280, 16);
    expect(fit).not.toBeNull();
    const south = toScreen(projectEquirectangular(points[0], fit!.origin), fit!);
    const north = toScreen(projectEquirectangular(points[1], fit!.origin), fit!);
    expect(north.y).toBeLessThan(south.y);
    expect(niceScaleMeters(320, 1 / fit!.scale)).toBeGreaterThan(0);
  });

  test("un encuadre asimétrico deja los puntos dentro del hueco", () => {
    const points = [
      { lat: 34.22, lon: -118.52 },
      { lat: 34.18, lon: -118.46 },
    ];
    const inset = { top: 72, right: 46, bottom: 40, left: 22 };
    const fit = fitLocalPlane(points, 360, 280, inset);
    expect(fit).not.toBeNull();
    for (const p of points) {
      const s = toScreen(projectEquirectangular(p, fit!.origin), fit!);
      expect(s.x).toBeGreaterThanOrEqual(inset.left - 0.01);
      expect(s.x).toBeLessThanOrEqual(360 - inset.right + 0.01);
      expect(s.y).toBeGreaterThanOrEqual(inset.top - 0.01);
      expect(s.y).toBeLessThanOrEqual(280 - inset.bottom + 0.01);
    }
  });
});
