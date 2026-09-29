import { describe, expect, it } from "vitest";
import { assessQuality } from "./quality";

function image(w: number, h: number, f: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

describe("assessQuality", () => {
  it("flags a flat dark image as dark and blurry", () => {
    const q = assessQuality(image(64, 64, () => 10));
    expect(q.dark).toBe(true);
    expect(q.blurry).toBe(true);
  });
  it("passes a bright, detailed image", () => {
    const q = assessQuality(image(64, 64, (x, y) => ((x + y) % 2 ? 230 : 60)));
    expect(q.dark).toBe(false);
    expect(q.blurry).toBe(false);
  });
  it("flags a smooth gradient as blurry but not dark", () => {
    const q = assessQuality(image(64, 64, (x) => 100 + x));
    expect(q.dark).toBe(false);
    expect(q.blurry).toBe(true);
  });
});
