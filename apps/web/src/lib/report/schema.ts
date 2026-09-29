import { z } from "zod";
import { AI_LABELS, LARVAE, SITE_TYPES, type ReportMeta } from "./types";

// Kept out of types.ts so zod never lands in the citizen bundle.
// Mirrors supabase/functions/_shared/report.ts (the server is the real gate).
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
}) satisfies z.ZodType<ReportMeta>;
