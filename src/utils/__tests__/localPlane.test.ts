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
});
