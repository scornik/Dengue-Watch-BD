// Minimal JPEG metadata stripper (no decoding). Removes every APPn segment
// except APP0 (JFIF) and all COM segments, which drops EXIF (incl. GPS), XMP,
// IPTC/Photoshop and ICC blocks. Pixel data is untouched.
// Browsers already bake EXIF orientation into canvas output, so dropping the
// Orientation tag does not rotate images.

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export class JpegError extends Error {}

export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (!isJpeg(input)) throw new JpegError("not a JPEG");
  const out: Uint8Array[] = [input.subarray(0, 2)]; // SOI
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new JpegError(`bad marker at ${i}`);
    // Skip fill bytes (0xFF 0xFF ...)
    let j = i;
    while (j < input.length && input[j] === 0xff) j++;
    const marker = input[j];
    if (marker === undefined) throw new JpegError("truncated");
    const markerStart = j - 1;
    // Standalone markers without length
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(input.subarray(markerStart, j + 1));
      i = j + 1;
      continue;
    }
    if (marker === 0xd9) {
      out.push(input.subarray(markerStart, j + 1));
      break;
    }
    if (j + 2 >= input.length) throw new JpegError("truncated segment");
    const len = (input[j + 1]! << 8) | input[j + 2]!;
    if (len < 2) throw new JpegError("bad segment length");
    const segEnd = j + 1 + len;
    if (segEnd > input.length) throw new JpegError("truncated segment");
    const isAppN = marker >= 0xe1 && marker <= 0xef; // APP1..APP15
    const isComment = marker === 0xfe;
    if (!isAppN && !isComment) out.push(input.subarray(markerStart, segEnd));
    if (marker === 0xda) {
      // Start of scan: the rest (entropy-coded data up to EOI) is copied verbatim.
      out.push(input.subarray(segEnd));
      break;
    }
    i = segEnd;
  }
  const total = out.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const part of out) {
    result.set(part, o);
    o += part.length;
  }
  return result;
}

/** True if any APP1 segment containing "Exif" remains (used by tests). */
export function hasExif(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 6; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78) return true;
  }
  return false;
}
