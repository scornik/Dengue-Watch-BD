export const SITE_TYPES = [
  "tire",
  "bucket_drum",
  "ac_drip",
  "construction",
  "rooftop",
  "flower_tub",
  "drain",
  "other",
] as const;
export const LARVAE = ["yes", "no", "unsure"] as const;
export const AI_LABELS = ["likely", "unclear", "not_relevant", "pending"] as const;
export const SITE_STATUSES = ["new", "verified", "assigned", "cleared", "not_found", "rejected"] as const;

export type SiteType = (typeof SITE_TYPES)[number];
export type Larvae = (typeof LARVAE)[number];
export type AiLabel = (typeof AI_LABELS)[number];
export type SiteStatus = (typeof SITE_STATUSES)[number];

/** Metadata sent with each report (validated server-side; see schema.ts). */
export type ReportMeta = {
  id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  site_type: SiteType;
  larvae_seen: Larvae;
  self_cleaned: boolean;
  note: string | null;
  ai_label: AiLabel;
  ai_score: number | null;
  device_id: string;
  client_created_at: string;
};
