import type { SiteStatus } from "@/lib/report/types";

// Aedes palette (see globals.css): blood = needs action, neem = destroyed.
// All colours keep >= 4.5:1 contrast with white badge text.
export const STATUS_COLORS: Record<SiteStatus, string> = {
  new: "#d7263d",
  verified: "#7a2e8e",
  assigned: "#a55f00",
  cleared: "#237a40",
  not_found: "#4e5470",
  rejected: "#6b7280",
};

export const RISK_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#dc2626",
} as const;
export type RiskLevel = keyof typeof RISK_COLORS;
export const RISK_LEVELS = Object.keys(RISK_COLORS) as RiskLevel[];

/** Ward shading by citizen reports in the last 28 days: lower bound of each bucket. */
export const REPORT_BUCKETS = [
  { min: 0, color: "#eef1f6", label: "0" },
  { min: 1, color: "#fbd3d8", label: "1–2" },
  { min: 3, color: "#f08a97", label: "3–5" },
  { min: 6, color: "#d7263d", label: "6–10" },
  { min: 11, color: "#7d1022", label: "11+" },
] as const;

export function reportColor(n: number | null | undefined): string {
  let c: string = REPORT_BUCKETS[0].color;
  for (const b of REPORT_BUCKETS) if ((n ?? 0) >= b.min) c = b.color;
  return c;
}

export type MapMode = "reports" | "risk";
