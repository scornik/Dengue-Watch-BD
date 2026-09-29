import { describe, expect, it } from "vitest";
import { reportMetaSchema as clientSchema } from "./schema";
import { reportMetaSchema as serverSchema } from "../../../../../supabase/functions/_shared/report.ts";

const valid = {
  id: "7d6f1b6e-2d2c-4a51-9a53-5a4b2a9c1f00",
  lat: 23.8,
  lng: 90.4,
  accuracy_m: 8,
  site_type: "ac_drip",
  larvae_seen: "unsure",
  self_cleaned: true,
  note: "roof",
  ai_label: "likely",
  ai_score: 0.7,
  device_id: "0123456789abcdef0123",
  client_created_at: "2026-09-29T10:00:00.000Z",
};

describe("client and server report schemas agree", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["valid", valid],
    ["bad type", { ...valid, site_type: "pond" }],
    ["outside BD", { ...valid, lat: 40 }],
    ["long note", { ...valid, note: "x".repeat(501) }],
    ["short device", { ...valid, device_id: "abc" }],
    ["bad label", { ...valid, ai_label: "maybe" }],
  ];
  it.each(cases)("%s", (_name, input) => {
    expect(clientSchema.safeParse(input).success).toBe(serverSchema.safeParse(input).success);
  });
});
