import type { SiteStatus } from "@/lib/report/types";

export const STATUS_COLORS: Record<SiteStatus, string> = {
  new: "#1d4ed8",
  verified: "#6d28d9",
  assigned: "#b45309",
  cleared: "#15803d",
  not_found: "#4b5563",
  rejected: "#9ca3af",
};

export const RISK_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#dc2626",
} as const;
export type RiskLevel = keyof typeof RISK_COLORS;
export const RISK_LEVELS = Object.keys(RISK_COLORS) as RiskLevel[];
