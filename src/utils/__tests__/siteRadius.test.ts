/** Radio de sitio: NaN, vacío y ≤ 0 no se guardan. */
import { parseSiteRadius } from "../siteRadius";

describe("parseSiteRadius", () => {
  test.each([
    ["150", 150],
    ["  80 ", 80],
    ["100.4", 100],
    ["100.6", 101],
    ["1,5", 2],
    ["0.6", 1],
  ])("%s → %s", (raw, expected) => {
    expect(parseSiteRadius(raw)).toBe(expected);
  });

  test.each(["", "   ", "0", "0.4", "-3", "abc", "NaN", "1,5,5", "Infinity"])("%s no es un radio", (raw) => {
    expect(parseSiteRadius(raw)).toBeNull();
  });
});
