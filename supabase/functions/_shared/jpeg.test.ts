import { describe, expect, it } from "vitest";
import { hasExif, isJpeg, stripJpegMetadata } from "./jpeg.ts";

const seg = (marker: number, payload: number[]) => {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
};
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// SOI, APP0 JFIF, APP1 Exif (with fake GPS), COM, DQT, SOS + scan data, EOI
const sample = new Uint8Array([
  0xff, 0xd8,
  ...seg(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...seg(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 23.8103N 90.4125E")]),
  ...seg(0xfe, ascii("comment with name")),
  ...seg(0xdb, [0, ...new Array(64).fill(1)]),
  ...seg(0xda, [1, 1, 0, 0, 63, 0]),
  0x12, 0x34, 0xff, 0x00, 0x56, // entropy data incl. stuffed 0xFF00
  0xff, 0xd9,
]);

describe("stripJpegMetadata", () => {
  it("detects JPEG", () => {
    expect(isJpeg(sample)).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]))).toBe(false);
  });

  it("removes EXIF/APPn and comments but keeps JFIF, tables and scan data", () => {
    expect(hasExif(sample)).toBe(true);
    const out = stripJpegMetadata(sample);
    expect(hasExif(out)).toBe(false);
    const text = new TextDecoder("latin1").decode(out);
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("comment");
    expect(text).toContain("JFIF");
    expect(Array.from(out.slice(-7))).toEqual([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
    expect(out.length).toBeLessThan(sample.length);
  });

  it("is idempotent", () => {
    const once = stripJpegMetadata(sample);
    expect(stripJpegMetadata(once)).toEqual(once);
  });

  it("drops trailers after EOI (Motion Photo, gain maps, appended EXIF)", () => {
    const trailer = [0xff, 0xd8, ...seg(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 23.81N")]), 0xff, 0xd9, ...ascii("ftypmp42")];
    const out = stripJpegMetadata(new Uint8Array([...sample, ...trailer]));
    expect(out).toEqual(stripJpegMetadata(sample));
    expect(Array.from(out.slice(-2))).toEqual([0xff, 0xd9]);
    const text = new TextDecoder("latin1").decode(out);
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("ftyp");
  });

  it("removes APPn/COM between progressive scans but keeps scan data and RSTn", () => {
    const scan1 = [0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]; // stuffing + RST0
    const scan2 = [0x44, 0xff, 0xff, 0xd1, 0x55]; // fill byte before RST1
    const progressive = new Uint8Array([
      0xff, 0xd8,
      ...seg(0xdb, [0, ...new Array(64).fill(1)]),
      ...seg(0xda, [1, 1, 0, 0, 0, 0]),
      ...scan1,
      ...seg(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 23.81N")]),
      ...seg(0xfe, ascii("secret comment")),
      ...seg(0xc4, [0x10, ...new Array(16).fill(0)]),
      ...seg(0xda, [1, 1, 0, 1, 63, 0]),
      ...scan2,
      0xff, 0xd9,
    ]);
    const out = stripJpegMetadata(progressive);
    expect(hasExif(out)).toBe(false);
    const text = new TextDecoder("latin1").decode(out);
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("secret");
    expect(Array.from(out)).toEqual([
      0xff, 0xd8,
      ...seg(0xdb, [0, ...new Array(64).fill(1)]),
      ...seg(0xda, [1, 1, 0, 0, 0, 0]),
      ...scan1,
      ...seg(0xc4, [0x10, ...new Array(16).fill(0)]),
      ...seg(0xda, [1, 1, 0, 1, 63, 0]),
      ...scan2,
      0xff, 0xd9,
    ]);
  });

  it("leaves a clean baseline JPEG byte-for-byte unchanged", () => {
    const clean = stripJpegMetadata(sample);
    const baseline = new Uint8Array([
      ...clean.slice(0, 2),
      ...seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
      ...seg(0xc4, [0x00, ...new Array(16).fill(0)]),
      ...clean.slice(2),
    ]);
    expect(stripJpegMetadata(baseline)).toEqual(baseline);
  });

  it("drops APP0 JFXX thumbnails and JFIF headers with a thumbnail", () => {
    const withThumb = new Uint8Array([
      0xff, 0xd8,
      ...seg(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0xaa, 0xbb, 0xcc]),
      ...seg(0xe0, [...ascii("JFXX"), 0, 0x10, 0xde, 0xad]),
      ...seg(0xda, [1, 1, 0, 0, 63, 0]),
      0x12, 0xff, 0xd9,
    ]);
    const out = stripJpegMetadata(withThumb);
    expect(Array.from(out)).toEqual([0xff, 0xd8, ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0xff, 0xd9]);
  });

  it("throws when the scan has no EOI", () => {
    expect(() => stripJpegMetadata(sample.slice(0, -2))).toThrow();
  });

  it("throws on non-JPEG and truncated input", () => {
    expect(() => stripJpegMetadata(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
    expect(() => stripJpegMetadata(sample.slice(0, 12))).toThrow();
  });
});
