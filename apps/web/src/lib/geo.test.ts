import { describe, expect, it } from "vitest";
import { distanceM, navigationLinks } from "./geo";

describe("distanceM", () => {
  it("is ~11 m for 0.0001° latitude and ~102 m for 0.001° longitude in Dhaka", () => {
    expect(distanceM({ lat: 23.8, lng: 90.4 }, { lat: 23.8001, lng: 90.4 })).toBeCloseTo(11.1, 0);
    expect(distanceM({ lat: 23.8, lng: 90.4 }, { lat: 23.8, lng: 90.401 })).toBeCloseTo(101.8, 0);
  });
  it("is zero for the same point", () => {
    expect(distanceM({ lat: 23.8, lng: 90.4 }, { lat: 23.8, lng: 90.4 })).toBe(0);
  });
});

describe("navigationLinks", () => {
  it("builds a geo: URI", () => {
    expect(navigationLinks(23.8, 90.4).geo).toBe("geo:23.800000,90.400000?q=23.800000,90.400000");
  });
});
