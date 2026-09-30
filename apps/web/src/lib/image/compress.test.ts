import { describe, expect, it } from "vitest";
import { encodeToTarget } from "./compress";

const fakeCanvas = {} as HTMLCanvasElement;
// Size shrinks with quality, like a real JPEG encoder.
const enc = async (_c: HTMLCanvasElement, q: number) => new Blob([new Uint8Array(Math.round(q * 300_000))]);

describe("encodeToTarget", () => {
  it("returns the first quality that fits the budget", async () => {
    const b = await encodeToTarget(fakeCanvas, 140_000, [0.62, 0.52, 0.44, 0.36], enc);
    expect(b.size).toBe(132_000); // q = 0.44
  });
  it("falls back to the lowest step when nothing fits", async () => {
    const b = await encodeToTarget(fakeCanvas, 10, [0.6, 0.3], enc);
    expect(b.size).toBe(90_000);
  });
});
