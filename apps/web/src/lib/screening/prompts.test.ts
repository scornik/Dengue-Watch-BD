import { describe, expect, it } from "vitest";
import { ALL_PROMPTS, deviceCanScreen, mapClipScores, NEGATIVE_PROMPTS, POSITIVE_PROMPTS } from "./prompts";

const dist = (weights: Record<string, number>) => {
  const rest = ALL_PROMPTS.filter((p) => !(p in weights));
  const used = Object.values(weights).reduce((a, b) => a + b, 0);
  return [
    ...Object.entries(weights).map(([label, score]) => ({ label, score })),
    ...rest.map((label) => ({ label, score: (1 - used) / rest.length })),
  ];
};

describe("mapClipScores", () => {
  it("labels a tire photo likely", () => {
    const r = mapClipScores(dist({ [POSITIVE_PROMPTS[1]]: 0.7, [POSITIVE_PROMPTS[0]]: 0.1 }));
    expect(r.label).toBe("likely");
    expect(r.score).toBeGreaterThan(0.8);
  });
  it("labels a selfie not relevant", () => {
    expect(mapClipScores(dist({ [NEGATIVE_PROMPTS[0]]: 0.9 })).label).toBe("not_relevant");
  });
  it("labels a split decision unclear", () => {
    const r = mapClipScores([
      { label: POSITIVE_PROMPTS[0], score: 0.45 },
      { label: NEGATIVE_PROMPTS[2], score: 0.55 },
    ]);
    expect(r.label).toBe("unclear");
    expect(r.score).toBeCloseTo(0.45);
  });
  it("handles empty output", () => {
    expect(mapClipScores([]).label).toBe("not_relevant");
  });
});

describe("deviceCanScreen", () => {
  it("skips low-memory, low-core and data-saver devices", () => {
    expect(deviceCanScreen({ deviceMemory: 2 })).toBe(false);
    expect(deviceCanScreen({ hardwareConcurrency: 2 })).toBe(false);
    expect(deviceCanScreen({ connection: { saveData: true } })).toBe(false);
    expect(deviceCanScreen({ connection: { effectiveType: "2g" } })).toBe(false);
    expect(deviceCanScreen({ connection: { effectiveType: "3g" } })).toBe(false);
    expect(deviceCanScreen({ deviceMemory: 4, hardwareConcurrency: 8, connection: { effectiveType: "4g" } })).toBe(true);
    expect(deviceCanScreen({})).toBe(true);
  });
});
