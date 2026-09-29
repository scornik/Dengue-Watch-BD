import { z } from "zod";
import { SITE_TYPES } from "./report.ts";

// Strict output contract shared by every paid/self-hosted screening provider.
export const SCREEN_LABELS = ["likely", "unclear", "not_relevant"] as const;

export const screenResultSchema = z
  .object({
    label: z.enum(SCREEN_LABELS),
    // P(photo shows a possible Aedes breeding site), 0..1
    score: z.number().min(0).max(1),
    site_type: z.enum(SITE_TYPES).nullable(),
    reason: z.string().max(300),
  })
  .strict();
export type ScreenResult = z.infer<typeof screenResultSchema>;

/** JSON Schema given to providers that support constrained output. */
export const SCREEN_JSON_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: [...SCREEN_LABELS] },
    score: { type: "number" },
    site_type: { anyOf: [{ type: "string", enum: [...SITE_TYPES] }, { type: "null" }] },
    reason: { type: "string" },
  },
  required: ["label", "score", "site_type", "reason"],
  additionalProperties: false,
} as const;

export const SCREEN_PROMPT = `You screen citizen photos for a dengue-prevention app in Dhaka, Bangladesh.
Decide whether the photo shows a possible Aedes mosquito breeding site: standing water in a
container or small collection (tires, buckets, drums, AC drip trays, flower pots/tubs, rooftops,
construction sites, clogged drains, discarded containers).
- "likely": standing water or a water-holding container is clearly visible.
- "not_relevant": selfies, screenshots, documents, food, indoor scenes without water, or anything unrelated.
- "unclear": anything in between (too dark, too far, water not visible).
score = your probability (0..1) that it is a possible breeding site.
site_type = the best matching type, or null if not relevant.
reason = one short English sentence. Do not describe people.
Respond with JSON only: {"label", "score", "site_type", "reason"}.`;

/** Parse and validate provider text output. Returns null on any failure. */
export function parseScreenOutput(text: string): ScreenResult | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const r = screenResultSchema.safeParse(JSON.parse(trimmed));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
