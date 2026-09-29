/// <reference lib="webworker" />
// Zero-shot CLIP screening off the main thread. Model files are cached by
// transformers.js in the Cache API ("transformers-cache"), so later visits
// load from disk.
import { env, pipeline, RawImage } from "@huggingface/transformers";
import { ALL_PROMPTS, mapClipScores } from "./prompts";

type In = { type: "load"; model: string } | { type: "classify"; id: number; image: Blob };

env.allowLocalModels = false;
env.useBrowserCache = true;

type Classifier = (image: RawImage, labels: string[], opts: { hypothesis_template: string }) => Promise<{ label: string; score: number }[]>;
let classifier: Promise<Classifier> | null = null;

function load(model: string) {
  classifier ??= pipeline("zero-shot-image-classification", model, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: { status: string; progress?: number; file?: string }) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        postMessage({ type: "progress", file: p.file, progress: p.progress });
      }
    },
  }) as unknown as Promise<Classifier>;
  return classifier;
}

self.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load(msg.model);
      postMessage({ type: "ready" });
    } else if (msg.type === "classify") {
      if (!classifier) throw new Error("model not loaded");
      const clf = await classifier;
      const image = await RawImage.fromBlob(msg.image);
      const out = await clf(image, [...ALL_PROMPTS], { hypothesis_template: "{}" });
      postMessage({ type: "result", id: msg.id, ...mapClipScores(out), raw: out.slice(0, 5) });
    }
  } catch (err) {
    postMessage({ type: "error", id: "id" in msg ? msg.id : undefined, message: String(err) });
  }
};
