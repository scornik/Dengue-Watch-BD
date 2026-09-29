import { describe, expect, it } from "vitest";
import { previousWeek, renderDigestHtml, type DigestRow } from "./digest.ts";

const row = (o: Partial<DigestRow>): DigestRow => ({
  ward_id: 1, ward_no: 1, name_bn: "ওয়ার্ড ১", name_en: "Ward 1", new_sites: 0, cleared: 0,
  not_found: 0, open_total: 0, overdue: 0, risk_level: null, ...o,
});

describe("digest", () => {
  it("renders totals in Bangla digits, busiest wards first, escapes names", () => {
    const html = renderDigestHtml({
      cityCorp: "DSCC",
      weekStart: "2026-09-21",
      siteUrl: "https://x.org",
      rows: [
        row({ ward_id: 101, ward_no: 1, new_sites: 3, cleared: 2, open_total: 1 }),
        row({ ward_id: 102, ward_no: 2, name_bn: "<b>x</b>", new_sites: 1, open_total: 4, overdue: 2, risk_level: "red" }),
      ],
    });
    expect(html).toContain("<b>৪</b>"); // new total
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html.indexOf("/ward/102")).toBeLessThan(html.indexOf("/ward/101"));
    expect(html).toContain("Environmental risk, not confirmed cases");
  });
  it("computes the previous Monday in Asia/Dhaka", () => {
    // Monday 2026-09-28 08:00 Dhaka (02:00 UTC) -> previous week starts 2026-09-21
    const w = previousWeek(new Date("2026-09-28T02:00:00Z"));
    expect(w.date).toBe("2026-09-21");
    expect(w.start).toBe("2026-09-20T18:00:00.000Z");
    // Sunday 23:00 Dhaka still belongs to the week starting 2026-09-21 -> previous is 09-14
    expect(previousWeek(new Date("2026-09-27T17:00:00Z")).date).toBe("2026-09-14");
  });
});
