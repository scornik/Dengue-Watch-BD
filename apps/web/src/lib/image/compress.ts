export type Prepared = {
  blob: Blob; // JPEG, EXIF-free (canvas output has no metadata)
  url: string; // object URL for preview
  sample: ImageData; // small copy for quality checks
  width: number;
  height: number;
};

/**
 * Downscale to at most `maxSide` px and re-encode as JPEG. Browsers apply the
 * EXIF orientation when decoding, and canvas output carries no EXIF, so GPS
 * and camera metadata never leave the phone.
 */
export async function preparePhoto(file: Blob, maxSide = 1600, quality = 0.82): Promise<Prepared> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality),
  );
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
