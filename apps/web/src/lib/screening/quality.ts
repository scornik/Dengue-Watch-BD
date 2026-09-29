export type Quality = { brightness: number; sharpness: number; dark: boolean; blurry: boolean };

// Thresholds are for a ~160 px sample. Kept lenient: the check only nudges.
export const DARK_THRESHOLD = 35; // mean luma 0-255
export const BLUR_THRESHOLD = 40; // variance of the Laplacian

/** Mean luma and variance of the 4-neighbour Laplacian (classic blur metric). */
export function assessQuality(img: { data: Uint8ClampedArray; width: number; height: number }): Quality {
  const { data, width: w, height: h } = img;
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    const y = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    gray[p] = y;
    sum += y;
  }
  const brightness = sum / (w * h);
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const lap = gray[p - 1]! + gray[p + 1]! + gray[p - w]! + gray[p + w]! - 4 * gray[p]!;
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  const sharpness = n > 1 ? m2 / (n - 1) : 0;
  return {
    brightness,
    sharpness,
    dark: brightness < DARK_THRESHOLD,
    blurry: sharpness < BLUR_THRESHOLD,
  };
}
