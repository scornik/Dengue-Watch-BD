// Minimal JPEG metadata stripper (no decoding). Walks every marker segment,
// including the entropy-coded data of each scan (0xFF00 stuffing, RSTn), so
// metadata placed between progressive scans is found too. Removes:
// - every APP1..APP15 segment and every COM segment (EXIF incl. GPS, XMP,
//   IPTC/Photoshop, ICC, MPF, ...), wherever they appear;
// - APP0 unless it is the plain JFIF header without an embedded thumbnail
//   (JFXX extensions and thumbnails are dropped);
// - everything after the first EOI (Motion Photo video, Ultra-HDR gain maps,
//   appended EXIF/XMP/GPS trailers).
// Pixel data is untouched. Browsers already bake EXIF orientation into canvas
// output, so dropping the Orientation tag does not rotate images.

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export class JpegError extends Error {}

const JFIF_ID = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"

/** APP0 payload that is exactly the JFIF header with a 0x0 thumbnail. */
function isPlainJfif(input: Uint8Array, payloadStart: number, len: number): boolean {
  if (len !== 16) return false; // 2 (length) + 5 (id) + 2 + 1 + 2 + 2 + 1 + 1
  for (let k = 0; k < JFIF_ID.length; k++) if (input[payloadStart + k] !== JFIF_ID[k]) return false;
  return input[payloadStart + 12] === 0 && input[payloadStart + 13] === 0;
}

/** Index of the first marker after the entropy-coded data starting at `from`. */
function endOfScan(input: Uint8Array, from: number): number {
  let k = from;
  while (k < input.length) {
    if (input[k] !== 0xff) {
      k++;
      continue;
    }
    // Skip fill bytes; the marker byte is the first non-0xFF byte.
    let m = k + 1;
    while (m < input.length && input[m] === 0xff) m++;
    const b = input[m];
    if (b === undefined) break;
    if (b === 0x00 || (b >= 0xd0 && b <= 0xd7)) {
      // Stuffed 0xFF or restart marker: part of the scan.
      k = m + 1;
      continue;
    }
    return k;
  }
  throw new JpegError("truncated scan");
}

export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (!isJpeg(input)) throw new JpegError("not a JPEG");
  const out: Uint8Array[] = [input.subarray(0, 2)]; // SOI
  let i = 2;
  let ended = false;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new JpegError(`bad marker at ${i}`);
    // Skip fill bytes (0xFF 0xFF ...)
    let j = i;
    while (j < input.length && input[j] === 0xff) j++;
    const marker = input[j];
    if (marker === undefined) throw new JpegError("truncated");
    const markerStart = j - 1;
    if (marker === 0xd8) throw new JpegError(`unexpected SOI at ${markerStart}`);
    // Standalone markers without length
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(input.subarray(markerStart, j + 1));
      i = j + 1;
      continue;
    }
    if (marker === 0xd9) {
      // EOI: anything after it (trailers, appended files) is dropped.
      out.push(input.subarray(markerStart, j + 1));
      ended = true;
      break;
    }
    if (j + 2 >= input.length) throw new JpegError("truncated segment");
    const len = (input[j + 1]! << 8) | input[j + 2]!;
    if (len < 2) throw new JpegError("bad segment length");
    const segEnd = j + 1 + len;
    if (segEnd > input.length) throw new JpegError("truncated segment");
    const isAppN = marker >= 0xe1 && marker <= 0xef; // APP1..APP15
    const isComment = marker === 0xfe;
    const isApp0 = marker === 0xe0;
    const keep = !isAppN && !isComment && (!isApp0 || isPlainJfif(input, j + 3, len));
    if (keep) out.push(input.subarray(markerStart, segEnd));
    if (marker === 0xda) {
      // Start of scan: copy the entropy-coded data, then resume marker parsing
      // (progressive JPEGs have more tables/scans, and maybe APPn, after it).
      const scanEnd = endOfScan(input, segEnd);
      out.push(input.subarray(segEnd, scanEnd));
      i = scanEnd;
      continue;
    }
    i = segEnd;
  }
  if (!ended) throw new JpegError("missing EOI");
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
