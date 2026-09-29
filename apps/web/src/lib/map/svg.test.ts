import { describe, expect, it } from "vitest";
import { bboxOf, geometryPath, makeViewport, project } from "./svg";

describe("svg projection", () => {
  const v = makeViewport([90.3, 23.7, 90.5, 23.9], 360);
  it("maps corners to the SVG box with north up", () => {
    const [x0, y0] = project(v, 90.3, 23.9);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(0);
    const [x, y] = project(v, 90.5, 23.7);
    expect(x).toBeCloseTo(360);
    expect(Math.abs(y - v.height)).toBeLessThan(1); // height is rounded
  });
  it("corrects for latitude (Dhaka box is taller than wide in pixels)", () => {
    expect(v.height).toBeGreaterThan(360);
  });
  it("builds polygon paths and bboxes", () => {
    const g = { type: "Polygon", coordinates: [[[90.3, 23.7], [90.5, 23.7], [90.5, 23.9], [90.3, 23.7]]] };
    expect(geometryPath(v, g)).toMatch(/^M0\.0 \d+\.\dL360\.0/);
    expect(bboxOf([g])).toEqual([90.3, 23.7, 90.5, 23.9]);
    expect(bboxOf([])).toEqual([90.33, 23.66, 90.5, 23.9]);
  });
});
