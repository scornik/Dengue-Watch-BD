import { describe, expect, it } from "vitest";
import { photoPath, reportMetaSchema, sanitizeNote, sha256Hex } from "./report.ts";

describe("report helpers", () => {
  it("removes phone numbers and emails from notes", () => {
    expect(sanitizeNote("call 01712345678 or me@x.com")).toBe("call [phone] or [email]");
    expect(sanitizeNote("ফোন ০১৭১২৩৪৫৬৭৮")).toBe("ফোন [phone]");
    expect(sanitizeNote("3rd floor roof, behind tea stall")).toBe("3rd floor roof, behind tea stall");
    expect(sanitizeNote("   ")).toBeNull();
  });
  it("hashes deterministically", async () => {
    expect(await sha256Hex("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
  });
  it("builds dated storage paths", () => {
    expect(photoPath("abc", new Date("2026-09-29T00:00:00Z"))).toBe("2026/09/abc.jpg");
  });
  it("rejects coordinates outside Bangladesh", () => {
    const base = {
      id: "7d6f1b6e-2d2c-4a51-9a53-5a4b2a9c1f00",
      lat: 23.8,
      lng: 90.4,
      accuracy_m: null,
      site_type: "tire",
      larvae_seen: "no",
      self_cleaned: false,
      note: null,
      ai_label: "pending",
      ai_score: null,
      device_id: "0123456789abcdef",
      client_created_at: "2026-09-29T10:00:00.000Z",
    };
    expect(reportMetaSchema.safeParse(base).success).toBe(true);
    expect(reportMetaSchema.safeParse({ ...base, lat: 51.5, lng: -0.1 }).success).toBe(false);
    expect(reportMetaSchema.safeParse({ ...base, site_type: "pond" }).success).toBe(false);
  });
});
