// Pure timing helpers shared by the compositions and scripts/srt.ts. No React imports here.

export type Word = { text: string; startMs: number; endMs: number; confidence: number };

/** A spoken line with its Bangla subtitle (English narration only). */
export type Line = { en: string; bn: string; startMs: number; endMs: number };

export type ManifestScene = {
  id: string;
  mood: string;
  audio: string;
  durationMs: number;
  words: Word[];
  lines?: Line[];
  avatar?: string;
};

export type Manifest = { video: string; engine: string; scenes: ManifestScene[] };

export const FPS = 30;
/** Cross-scene transition length. Kept below the 450 ms of silence narrate.py adds after each line,
 * so the next scene's voice never starts over the previous one's last word. */
export const TRANSITION_FRAMES = 12;
/** Extra hold after the last scene so the call to action stays on screen. */
export const OUTRO_FRAMES = 45;

export const msToFrames = (ms: number, fps = FPS) => Math.ceil((ms / 1000) * fps);

export const sceneFrames = (s: ManifestScene, fps = FPS) => msToFrames(s.durationMs, fps) + TRANSITION_FRAMES;

/** Absolute start frame of each scene in the TransitionSeries (transitions overlap neighbours). */
export const sceneStarts = (m: Manifest, fps = FPS) => {
  const starts: number[] = [];
  let t = 0;
  for (const s of m.scenes) {
    starts.push(t);
    t += sceneFrames(s, fps) - TRANSITION_FRAMES;
  }
  return starts;
};

export const totalFrames = (m: Manifest, fps = FPS) => {
  const sum = m.scenes.reduce((a, s) => a + sceneFrames(s, fps), 0);
  return sum - TRANSITION_FRAMES * (m.scenes.length - 1) + OUTRO_FRAMES;
};

/**
 * Scenes key on-screen beats to Bangla words. For the English narration the same beat is keyed to
 * the English word below, so one scene file serves both languages. Matching is case-sensitive.
 */
const EN_CUES: Record<string, string[]> = {
  জন্মায়: ["born"], আমাদের: ["still"], চলুন: ["Let's"], বাড়ির: ["around"], আশেপাশেই: ["homes"], পানিতে: ["water"],
  ডেঙ্গুওয়াচ: ["DengueWatch"], অ্যাপ: ["app"], নিবন্ধনও: ["sign"], লাল: ["red"], যাচাই: ["checks"], মানচিত্র: ["map"],
  পাত্র: ["container"], লার্ভা: ["larvae"], ঝাপসা: ["blurred"], শিকার: ["Hunt"], কাছের: ["near"], চাপুন: ["green"],
  তিন: ["three"], ফেলে: ["Throw"], ঘষে: ["Scrub"], ঢেকে: ["cover"], দাঁড়িয়েই: ["standing"], পয়েন্ট: ["points"],
  ভুয়া: ["Fake"], আজই: ["Today"], স্বেচ্ছাসেবক: ["volunteers"], স্বেচ্ছাসেবকেরা: ["Volunteers", "volunteers"],
  নাগরিকেরা: ["Citizens"], অগ্রগতি: ["progress"], ছবি: ["photo"], জিপিএস: ["GPS"], পাত্রের: ["container"],
  পঁচিশ: ["twenty"], ওয়ার্ডভিত্তিক: ["ward"], পরিবেশগত: ["environmental"], রোগীর: ["case"], পাওয়া: ["found"],
  পরিষ্কার: ["cleaned"], দ্রুত: ["fast"], অ্যাডমিন: ["admin"], তালিকা: ["list"], বন্ধ: ["close"], সাপ্তাহিক: ["weekly"],
  ডাউনলোড: ["downloaded"], যুক্ত: ["add"],
};

/** Frame (relative to the scene) at which the first word containing `needle` starts. */
export const wordFrame = (s: ManifestScene, needle: string, fps = FPS, fallbackFrame = 0) => {
  for (const n of [needle, ...(EN_CUES[needle] ?? [])]) {
    const w = s.words.find((x) => x.text.includes(n));
    if (w) return Math.round((w.startMs / 1000) * fps);
  }
  return fallbackFrame;
};

export const scene = (m: Manifest, id: string) => {
  const s = m.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`${m.video}: no scene "${id}" in the manifest, run media/voice/narrate.py`);
  return s;
};
