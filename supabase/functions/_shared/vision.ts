// Provider interface for the optional paid screening tier (and the P3 self-hosted
// detector). Every provider returns the same validated ScreenResult or null.
import Anthropic from "@anthropic-ai/sdk";
import { parseScreenOutput, SCREEN_JSON_SCHEMA, SCREEN_PROMPT, type ScreenResult } from "./screening.ts";

export interface VisionProvider {
  /** ai_labels.source value */
  source: "api" | "model";
  name: string;
  model: string;
  screen(jpegBase64: string): Promise<{ result: ScreenResult | null; raw: unknown }>;
}

export function anthropicProvider(apiKey: string, model: string): VisionProvider {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
  return {
    source: "api",
    name: "anthropic",
    model,
    async screen(data) {
      const msg = await client.messages.create({
        model,
        max_tokens: 400,
        output_config: { format: { type: "json_schema", schema: SCREEN_JSON_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
              { type: "text", text: SCREEN_PROMPT },
            ],
          },
        ],
      } as Anthropic.MessageCreateParamsNonStreaming);
      if (msg.stop_reason === "refusal") return { result: null, raw: { stop_reason: msg.stop_reason } };
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return { result: parseScreenOutput(text), raw: { text, usage: msg.usage, model: msg.model } };
    },
  };
}

export function geminiProvider(apiKey: string, model: string): VisionProvider {
  return {
    source: "api",
    name: "gemini",
    model,
    async screen(data) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data } }, { text: SCREEN_PROMPT }] }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 400, temperature: 0 },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) return { result: null, raw: { status: res.status } };
      const text: string = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      return { result: parseScreenOutput(text), raw: { text, usage: body?.usageMetadata } };
    },
  };
}

/** Self-hosted detector from /workers/detector (POST /screen). */
export function detectorProvider(url: string, token: string): VisionProvider {
  return {
    source: "model",
    name: "detector",
    model: "yolo-cls",
    async screen(data) {
      const res = await fetch(`${url.replace(/\/$/, "")}/screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_base64: data }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) return { result: null, raw: { status: res.status } };
      const withReason = { reason: "", ...body };
      return { result: parseScreenOutput(JSON.stringify(withReason)), raw: body };
    },
  };
}

export function providerFromEnv(get: (k: string) => string | undefined): VisionProvider | null {
  const name = get("VISION_PROVIDER") ?? "anthropic";
  if (name === "anthropic" && get("ANTHROPIC_API_KEY")) {
    return anthropicProvider(get("ANTHROPIC_API_KEY")!, get("VISION_MODEL") || "claude-haiku-4-5-20251001");
  }
  if (name === "gemini" && get("GEMINI_API_KEY")) {
    return geminiProvider(get("GEMINI_API_KEY")!, get("GEMINI_MODEL") || "gemini-2.5-flash");
  }
  if (name === "model" && get("DETECTOR_URL") && get("DETECTOR_TOKEN")) {
    return detectorProvider(get("DETECTOR_URL")!, get("DETECTOR_TOKEN")!);
  }
  return null;
}
