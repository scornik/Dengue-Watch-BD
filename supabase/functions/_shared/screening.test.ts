import { describe, expect, it } from "vitest";
import { parseScreenOutput } from "./screening.ts";

describe("parseScreenOutput", () => {
  it("accepts strict JSON", () => {
    const r = parseScreenOutput('{"label":"likely","score":0.9,"site_type":"tire","reason":"Tire with water."}');
    expect(r).toEqual({ label: "likely", score: 0.9, site_type: "tire", reason: "Tire with water." });
  });
  it("strips code fences", () => {
    expect(parseScreenOutput('```json\n{"label":"unclear","score":0.4,"site_type":null,"reason":"dark"}\n```')?.label).toBe("unclear");
  });
  it("rejects invalid labels, extra keys, out-of-range scores and prose", () => {
    expect(parseScreenOutput('{"label":"yes","score":0.9,"site_type":null,"reason":""}')).toBeNull();
    expect(parseScreenOutput('{"label":"likely","score":1.5,"site_type":null,"reason":""}')).toBeNull();
    expect(parseScreenOutput('{"label":"likely","score":0.5,"site_type":null,"reason":"","x":1}')).toBeNull();
    expect(parseScreenOutput("I think it is a tire.")).toBeNull();
  });
});
