import { describe, expect, it, vi } from "vitest";
import { sendReport } from "./send";
import type { ReportMeta } from "@/lib/report/types";

const meta: ReportMeta = {
  id: "7d6f1b6e-2d2c-4a51-9a53-5a4b2a9c1f00",
  lat: 23.8,
  lng: 90.4,
  accuracy_m: 12,
  site_type: "tire",
  larvae_seen: "yes",
  self_cleaned: false,
  note: null,
  ai_label: "likely",
  ai_score: 0.8,
  device_id: "0123456789abcdef0123",
  client_created_at: new Date().toISOString(),
};
const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
const json = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("sendReport", () => {
  it("returns sent with the site id", async () => {
    const f = json(200, { id: meta.id, site_id: "s1" });
    await expect(sendReport(meta, photo, "tok", f)).resolves.toEqual({ kind: "sent", siteId: "s1" });
    const [, init] = f.mock.calls[0]!;
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect((init.body as FormData).get("meta")).toContain(meta.id);
  });
  it("maps 429 to rate_limited", async () => {
    const out = await sendReport(meta, photo, null, json(429, { error: "rate_limited" }));
    expect(out.kind).toBe("rate_limited");
  });
  it("maps otp_required", async () => {
    const out = await sendReport(meta, photo, null, json(403, { code: "otp_required" }));
    expect(out.kind).toBe("otp_required");
  });
  it("maps 400 to rejected (not retried)", async () => {
    const out = await sendReport(meta, photo, null, json(400, { error: "bad meta" }));
    expect(out).toEqual({ kind: "rejected", error: "bad meta" });
  });
  it("keeps network failures for retry", async () => {
    const out = await sendReport(meta, photo, null, vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(out).toEqual({ kind: "retry", error: "Failed to fetch" });
  });
  it("keeps 401 (no session) for retry, not rejected", async () => {
    const out = await sendReport(meta, photo, null, json(401, { error: "sign in required" }));
    expect(out).toEqual({ kind: "retry", error: "sign in required" });
  });
  it("retries on 5xx", async () => {
    const out = await sendReport(meta, photo, null, json(503, {}));
    expect(out.kind).toBe("retry");
  });
});
