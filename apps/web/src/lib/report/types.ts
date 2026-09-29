import { z } from "zod";

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

/** Metadata sent with each report (mirrors supabase/functions/_shared/report.ts). */
export const reportMetaSchema = z.object({
  id: z.uuid(),
  lat: z.number().min(20).max(27),
  lng: z.number().min(88).max(93),
  accuracy_m: z.number().min(0).max(100_000).nullable(),
  site_type: z.enum(SITE_TYPES),
  larvae_seen: z.enum(LARVAE),
  self_cleaned: z.boolean(),
  note: z.string().max(500).nullable(),
  ai_label: z.enum(AI_LABELS),
  ai_score: z.number().min(0).max(1).nullable(),
  device_id: z.string().min(16).max(64),
  client_created_at: z.iso.datetime(),
});

export type ReportMeta = z.infer<typeof reportMetaSchema>;
