import { z } from "zod";

// Mirrors apps/web/src/lib/report/types.ts
export const SITE_TYPES = ["tire", "bucket_drum", "ac_drip", "construction", "rooftop", "flower_tub", "drain", "other"] as const;
export const LARVAE = ["yes", "no", "unsure"] as const;
export const AI_LABELS = ["likely", "unclear", "not_relevant", "pending"] as const;

export const reportMetaSchema = z.object({
  id: z.uuid(),
  // Bangladesh bounding box (generous)
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

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Strip phone numbers and emails from free-text notes (privacy). */
export function sanitizeNote(note: string | null): string | null {
  if (!note) return null;
  const cleaned = note
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(?:\+?88[\s-]?)?0?1[3-9](?:[\s-]?\d){8}/g, "[phone]")
    .replace(/(?:\+?৮৮[\s-]?)?০?১[৩-৯](?:[\s-]?[০-৯]){8}/g, "[phone]")
    .trim();
  return cleaned.slice(0, 500) || null;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Server-side storage key: report-photos/YYYY/MM/<id>.jpg */
export function photoPath(id: string, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}/${m}/${id}.jpg`;
}
