import { describe, expect, it } from "vitest";
import { validateWardCollection } from "./geojson";

const poly = { type: "Polygon", coordinates: [[[90.4, 23.8], [90.41, 23.8], [90.41, 23.81], [90.4, 23.8]]] };

describe("validateWardCollection", () => {
  it("accepts valid wards", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: poly, properties: { city_corp: "DNCC", ward_no: 1 } },
        { type: "Feature", geometry: poly, properties: { city_corp: "dscc", ward_no: "75" } },
      ],
    };
    expect(validateWardCollection(fc)).toEqual({ ok: true, count: 2 });
  });
  it("rejects bad corp, out-of-range ward, points and duplicates", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: poly, properties: { city_corp: "XYZ", ward_no: 1 } },
        { type: "Feature", geometry: poly, properties: { city_corp: "DNCC", ward_no: 55 } },
        { type: "Feature", geometry: { type: "Point" }, properties: { city_corp: "DNCC", ward_no: 2 } },
        { type: "Feature", geometry: poly, properties: { city_corp: "DNCC", ward_no: 2 } },
      ],
    };
    const r = validateWardCollection(fc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  });
  it("rejects non-collections", () => {
    expect(validateWardCollection({ type: "Feature" }).ok).toBe(false);
  });
});
