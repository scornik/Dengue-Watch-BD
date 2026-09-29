import { describe, expect, it } from "vitest";
import { formatNumber, hoursSince } from "./format";

describe("format", () => {
  it("uses Bangla digits for bn", () => {
    expect(formatNumber(1234, "bn")).toBe("১,২৩৪");
    expect(formatNumber(1234, "en")).toBe("1,234");
  });
  it("computes whole hours since", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    expect(hoursSince("2026-09-29T09:30:00Z", now)).toBe(2);
    expect(hoursSince("2026-09-30T09:30:00Z", now)).toBe(0);
  });
});
