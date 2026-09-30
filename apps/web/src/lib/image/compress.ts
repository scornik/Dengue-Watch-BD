export type Prepared = {
  blob: Blob; // JPEG, EXIF-free (canvas output has no metadata)
  url: string; // object URL for preview
  sample: ImageData; // small copy for quality checks
  width: number;
  height: number;
};

/** Report and cleanup photos: small enough for 3G and a free-tier storage budget. */
export const PHOTO_MAX_SIDE = 1024;
export const PHOTO_TARGET_BYTES = 120_000;
/** Qualities tried in order until the JPEG fits the target. */
export const QUALITY_STEPS = [0.62, 0.52, 0.44, 0.36, 0.3] as const;

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality),
  );
}

/** Smallest acceptable JPEG: first quality step that fits `target`, else the lowest step. */
export async function encodeToTarget(
  canvas: HTMLCanvasElement,
  target: number,
  steps: readonly number[] = QUALITY_STEPS,
  enc: (c: HTMLCanvasElement, q: number) => Promise<Blob> = encode,
): Promise<Blob> {
  let last: Blob | null = null;
  for (const q of steps) {
    last = await enc(canvas, q);
    if (last.size <= target) return last;
  }
  return last!;
}

function draw(bmp: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bmp, 0, 0, width, height);
  return { canvas, width, height };
}

/**
 * Downscale and re-encode as a small JPEG. Browsers apply the EXIF orientation
 * when decoding, and canvas output carries no EXIF, so GPS and camera metadata
 * never leave the phone.
 */
export async function preparePhoto(
  file: Blob,
  maxSide = PHOTO_MAX_SIDE,
  targetBytes = PHOTO_TARGET_BYTES,
): Promise<Prepared> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { canvas, width, height } = draw(bmp, maxSide);
  bmp.close?.();
  const blob = await encodeToTarget(canvas, targetBytes);
  // 160 px sample for blur/darkness checks
  const s = 160 / Math.max(width, height);
  const sw = Math.max(1, Math.round(width * s));
  const sh = Math.max(1, Math.round(height * s));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const sample = sctx.getImageData(0, 0, sw, sh);
  return { blob, url: URL.createObjectURL(blob), sample, width, height };
}

/** Square avatar, center-cropped, ~20 KB. */
export async function prepareAvatar(file: Blob, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")!
    .drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close?.();
  return encodeToTarget(canvas, 25_000, [0.6, 0.5, 0.4]);
}
