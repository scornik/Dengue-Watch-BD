import { describe, expect, it } from "vitest";
import { REPORT_BUCKETS, reportColor } from "./colors";

describe("reportColor", () => {
  it("buckets ward report counts", () => {
    expect(reportColor(null)).toBe(REPORT_BUCKETS[0].color);
    expect(reportColor(0)).toBe(REPORT_BUCKETS[0].color);
    expect(reportColor(2)).toBe(REPORT_BUCKETS[1].color);
    expect(reportColor(3)).toBe(REPORT_BUCKETS[2].color);
    expect(reportColor(10)).toBe(REPORT_BUCKETS[3].color);
    expect(reportColor(500)).toBe(REPORT_BUCKETS[4].color);
  });
});
