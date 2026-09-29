// Generates PWA icons from an inline SVG. Run: node scripts/gen-icons.mjs
import sharp from "sharp";

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#065f46"/>
  <g transform="translate(256 256) scale(${pad ? 0.72 : 0.9}) translate(-256 -256)">
    <path d="M256 70c-64 96-120 152-120 208a120 120 0 0 0 240 0c0-56-56-112-120-208z" fill="#ffffff"/>
    <path d="M200 300c0 34 26 60 56 60" stroke="#065f46" stroke-width="22" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

await sharp(Buffer.from(svg(false))).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(svg(false))).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(Buffer.from(svg(true))).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
await sharp(Buffer.from(svg(false))).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
console.log("icons written");
