import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Same tokens as apps/web/src/app/globals.css so the videos look like the app.
export const C = {
  ink: "#1b1f3b",
  inkDeep: "#0b0d1c",
  ink700: "#2b3160",
  ink500: "#4a5185",
  sky: "#e9f1f7",
  sky200: "#d3e2ee",
  blood: "#d7263d",
  blood700: "#a8182c",
  blood50: "#fdecee",
  neem: "#237a40",
  neem700: "#185c2f",
  neem50: "#e7f4ea",
  marigold: "#f5a524",
  marigold700: "#b86f00",
  marigold50: "#fff4df",
  violet: "#6d28d9",
  muted: "#4e5470",
  white: "#ffffff",
  risk: { green: "#22c55e", yellow: "#eab308", orange: "#f97316", red: "#dc2626" },
} as const;

// The exact font files the web app ships (apps/web/public/fonts), loaded locally so renders never
// depend on Google Fonts being reachable. Noto has Bengali glyphs only; Latin falls back to Baloo.
const BENGALI = "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1";
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2190-2193, U+2212, U+2709";
void Promise.all([
  loadFont({ family: "Baloo Da 2", url: staticFile("fonts/baloo-da-2-bengali-800.woff2"), weight: "800", unicodeRange: BENGALI }),
  loadFont({ family: "Baloo Da 2", url: staticFile("fonts/baloo-da-2-latin-800.woff2"), weight: "800", unicodeRange: LATIN }),
  loadFont({ family: "Noto Sans Bengali", url: staticFile("fonts/noto-sans-bengali-400.woff2"), weight: "400", unicodeRange: BENGALI }),
  loadFont({ family: "Noto Sans Bengali", url: staticFile("fonts/noto-sans-bengali-700.woff2"), weight: "700", unicodeRange: BENGALI }),
]);

export const display = `"Baloo Da 2", sans-serif`;
export const body = `"Noto Sans Bengali", "Baloo Da 2", sans-serif`;

/** The app's chunky "pressed button" shadow. */
export const hardShadow = (px = 8, color: string = C.inkDeep) => `0 ${px}px 0 0 ${color}`;

const BN = "০১২৩৪৫৬৭৮৯";
export const bn = (n: number | string) => String(n).replace(/\d/g, (d) => BN[Number(d)]);
