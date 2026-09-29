import type { AiLabel } from "@/lib/report/types";

// English prompts (CLIP is English-trained); the UI language is irrelevant here.
export const POSITIVE_PROMPTS = [
  "a photo of standing water in a container",
  "a discarded tire holding water",
  "a bucket or drum with water",
  "water in an AC drip tray",
  "a construction site with puddles",
  "a clogged drain",
  "a flower pot or tub with standing water",
  "stagnant water on a rooftop",
] as const;

export const NEGATIVE_PROMPTS = [
  "a selfie",
  "a screenshot",
  "a room interior with no water",
  "food",
  "a document or text",
  "a person or group of people",
] as const;

export const ALL_PROMPTS: readonly string[] = [...POSITIVE_PROMPTS, ...NEGATIVE_PROMPTS];

export const LIKELY_AT = 0.6;
export const NOT_RELEVANT_AT = 0.25;

/**
 * Map zero-shot scores (softmax over ALL_PROMPTS) to an ai_label.
 * score = probability mass on the positive prompts = P(possible breeding site),
 * the same meaning as the paid-API and self-hosted detector scores.
 */
export function mapClipScores(results: { label: string; score: number }[]): { label: AiLabel; score: number } {
  const positives = new Set<string>(POSITIVE_PROMPTS);
  let pos = 0;
  let total = 0;
  for (const r of results) {
    total += r.score;
    if (positives.has(r.label)) pos += r.score;
  }
  const score = total > 0 ? pos / total : 0;
  const label: AiLabel = score >= LIKELY_AT ? "likely" : score <= NOT_RELEVANT_AT ? "not_relevant" : "unclear";
  return { label, score: Math.round(score * 1000) / 1000 };
}

/** Should this device try to run the model at all? */
export function deviceCanScreen(nav: {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}): boolean {
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 3) return false;
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 4) return false;
  const c = nav.connection;
  if (c?.saveData) return false;
  // The model is tens of MB (cached after the first download): not on slow or metered-feeling links.
  if (c?.effectiveType && ["slow-2g", "2g", "3g"].includes(c.effectiveType)) return false;
  return true;
}
