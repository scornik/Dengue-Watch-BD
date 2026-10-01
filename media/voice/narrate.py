"""Generate Bangla narration per scene and word-accurate captions for the launch videos.

    python narrate.py citizen                    # draft voice (Meta MMS-TTS, CPU, non-commercial licence)
    python narrate.py citizen --engine indicf5   # your cloned voice (AI4Bharat IndicF5, GPU recommended)

Reads   media/scripts/<video>.json
Writes  media/video/public/voiceover/<video>/<scene>.mp3
        media/video/src/generated/<video>.json   (scene durations + word captions, read by Remotion)
        media/video/out/<video>.bn.srt            (subtitle track for Facebook/YouTube uploads)

    python narrate.py citizen --attach-avatars   # after media/avatar/lipsync.sh: link clips, no TTS

Captions are not transcribed. We already know every word, so we force-align the script against
the audio with MMS_FA (torchaudio, 1,100+ languages, romanised with uroman). The text is exactly
the script and only the timing is computed, so subtitles cannot contain recognition errors.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
PUBLIC = ROOT / "video" / "public" / "voiceover"
AVATARS = ROOT / "video" / "public" / "avatar"
OUT = ROOT / "video" / "out"
GENERATED = ROOT / "video" / "src" / "generated"
REFS = Path(__file__).resolve().parent / "refs"

ALIGN_SR = 16_000
LEAD_MS = 150
TAIL_MS = 450

# Draft voice has no emotion control; pacing per mood is the only lever.
MMS_RATE = {"serious": 0.92, "calm": 0.95, "warm": 1.0, "confident": 1.0, "hopeful": 0.97, "energetic": 1.08}


class DraftVoice:
    """facebook/mms-tts-ben: VITS, fast on CPU. Licence CC-BY-NC-4.0, so drafts and review only."""

    def __init__(self) -> None:
        from transformers import AutoTokenizer, VitsModel

        self.model = VitsModel.from_pretrained("facebook/mms-tts-ben")
        self.tok = AutoTokenizer.from_pretrained("facebook/mms-tts-ben")
        self.sr = self.model.config.sampling_rate

    def speak(self, text: str, mood: str) -> np.ndarray:
        self.model.speaking_rate = MMS_RATE.get(mood, 1.0)
        torch.manual_seed(7)  # VITS samples durations; fix the seed so re-runs match
        with torch.inference_mode():
            wav = self.model(**self.tok(text, return_tensors="pt")).waveform
        return wav[0].numpy()


class ClonedVoice:
    """ai4bharat/IndicF5: zero-shot voice cloning (MIT, gated on Hugging Face: accept the terms and
    `huggingface-cli login` first). Emotion and accent are copied from the reference clip, so record
    one clip per mood: refs/<mood>.wav + refs/<mood>.txt (exact transcript), falling back to
    refs/default.wav + refs/default.txt."""

    def __init__(self) -> None:
        from transformers import AutoModel

        self.model = AutoModel.from_pretrained("ai4bharat/IndicF5", trust_remote_code=True)
        if torch.cuda.is_available():
            self.model = self.model.to("cuda")
        self.sr = 24_000

    def speak(self, text: str, mood: str) -> np.ndarray:
        ref = REFS / f"{mood}.wav"
        if not ref.exists():
            ref = REFS / "default.wav"
        if not ref.exists():
            sys.exit(f"Missing reference voice: put a 6-12 s clip at {REFS}/default.wav (and {mood}.wav for this mood)")
        ref_text = ref.with_suffix(".txt").read_text(encoding="utf-8").strip()
        audio = self.model(text, ref_audio_path=str(ref), ref_text=ref_text)
        audio = np.asarray(audio)
        if audio.dtype == np.int16:  # IndicF5 returns int16 PCM
            return audio.astype(np.float32) / 32768.0
        return audio.astype(np.float32)


def trim(wav: np.ndarray, sr: int) -> np.ndarray:
    """Cut leading/trailing silence, then add a fixed breath so scenes cut cleanly."""
    env = np.abs(wav)
    thresh = max(env.max() * 0.02, 1e-4)
    idx = np.where(env > thresh)[0]
    if len(idx):
        wav = wav[max(idx[0] - int(0.03 * sr), 0) : idx[-1] + int(0.08 * sr)]
    lead = np.zeros(int(sr * LEAD_MS / 1000), dtype=wav.dtype)
    tail = np.zeros(int(sr * TAIL_MS / 1000), dtype=wav.dtype)
    peak = np.abs(wav).max() or 1.0
    return np.concatenate([lead, wav / peak * 0.89, tail])


class Aligner:
    def __init__(self) -> None:
        from uroman import Uroman

        bundle = torchaudio.pipelines.MMS_FA
        self.model = bundle.get_model(with_star=False)
        self.tokenizer = bundle.get_tokenizer()
        self.aligner = bundle.get_aligner()
        self.vocab = set(bundle.get_dict(star=None).keys()) - {"-", "*"}  # "-" is the CTC blank
        self.uroman = Uroman()

    def _roman(self, word: str) -> str:
        r = self.uroman.romanize_string(word).lower()
        r = re.sub(r"[’`]", "'", r)
        return "".join(c for c in r if c in self.vocab)

    def words(self, wav: np.ndarray, sr: int, text: str) -> list[dict]:
        audio = torch.from_numpy(wav).float().unsqueeze(0)
        if sr != ALIGN_SR:
            audio = torchaudio.functional.resample(audio, sr, ALIGN_SR)
        with torch.inference_mode():
            emission, _ = self.model(audio)

        words = text.split()
        roman = [self._roman(w) for w in words]
        keep = [i for i, r in enumerate(roman) if r]
        spans = self.aligner(emission[0], self.tokenizer([roman[i] for i in keep]))
        ratio = audio.size(1) / emission.size(1) / ALIGN_SR * 1000

        out: list[dict] = []
        timed = {i: (s[0].start * ratio, s[-1].end * ratio, sum(t.score for t in s) / len(s)) for i, s in zip(keep, spans)}
        for i, w in enumerate(words):
            if i not in timed:  # punctuation-only token: glue onto the previous word
                if out:
                    out[-1]["text"] += " " + w
                continue
            start, end, score = timed[i]
            out.append({"text": w, "startMs": round(start), "endMs": round(end), "confidence": round(float(score), 3)})
        # Close the gaps so the highlighted word never flickers off between words.
        for a, b in zip(out, out[1:]):
            a["endMs"] = max(a["endMs"], b["startMs"])
        return out


def to_mp3(wav: np.ndarray, sr: int, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.wav")
    sf.write(tmp, wav, sr)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-ar", "44100", "-ac", "1", "-b:a", "128k", str(dest)],
        check=True,
    )
    tmp.unlink()


# Must match FPS / TRANSITION_FRAMES in media/video/src/timeline.ts.
FPS = 30
TRANSITION_FRAMES = 12  # documented here; each scene is padded by it and overlaps by it, so it cancels


def attach_avatars(video: str, scenes: list[dict]) -> None:
    for s in scenes:
        clip = AVATARS / video / f"{s['id']}.mp4"
        if clip.exists():
            s["avatar"] = f"avatar/{video}/{s['id']}.mp4"
        else:
            s.pop("avatar", None)


def write_srt(video: str, scenes: list[dict]) -> Path:
    """One cue per ~7 words, timed on the final video timeline (scenes overlap during transitions)."""

    def ts(ms: float) -> str:
        ms = max(0, round(ms))
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

    cues, start_frame = [], 0
    for s in scenes:
        offset = start_frame / FPS * 1000
        words = s["words"]
        for i in range(0, len(words), 7):
            chunk = words[i : i + 7]
            cues.append((offset + chunk[0]["startMs"], offset + chunk[-1]["endMs"], " ".join(w["text"] for w in chunk)))
        start_frame += math.ceil(s["durationMs"] / 1000 * FPS)  # sceneFrames - TRANSITION_FRAMES in timeline.ts
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{video}.bn.srt"
    path.write_text("".join(f"{n}\n{ts(a)} --> {ts(b)}\n{t}\n\n" for n, (a, b, t) in enumerate(cues, 1)), encoding="utf-8")
    return path


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("video", help="script id in media/scripts, e.g. citizen")
    p.add_argument("--engine", choices=["draft", "indicf5"], default="draft")
    p.add_argument("--only", help="regenerate one scene id")
    p.add_argument("--attach-avatars", action="store_true", help="only link lip-synced clips from public/avatar/<video>/")
    args = p.parse_args()

    manifest_path = GENERATED / f"{args.video}.json"
    if args.attach_avatars:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        attach_avatars(args.video, manifest["scenes"])
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        linked = [s["id"] for s in manifest["scenes"] if s.get("avatar")]
        print(f"avatars linked: {', '.join(linked) or 'none'}")
        return

    script = json.loads((SCRIPTS / f"{args.video}.json").read_text(encoding="utf-8"))
    missing = [s["id"] for s in script["scenes"] if not s.get("narration", "").strip()]
    if missing:
        sys.exit(f"{args.video}: write the narration for {', '.join(missing)} first")

    voice = DraftVoice() if args.engine == "draft" else ClonedVoice()
    aligner = Aligner()

    previous = {s["id"]: s for s in json.loads(manifest_path.read_text())["scenes"]} if manifest_path.exists() else {}

    scenes = []
    for scene in script["scenes"]:
        sid = scene["id"]
        if args.only and sid != args.only and sid in previous:
            scenes.append(previous[sid])
            continue
        wav = trim(voice.speak(scene["narration"], scene["mood"]), voice.sr)
        words = aligner.words(wav, voice.sr, scene["narration"])
        to_mp3(wav, voice.sr, PUBLIC / args.video / f"{sid}.mp3")
        duration = round(len(wav) / voice.sr * 1000)
        low = [w["text"] for w in words if w["confidence"] < 0.35]
        print(f"{sid:12} {duration / 1000:5.1f}s  {len(words)} words" + (f"  check: {' '.join(low)}" if low else ""))
        scenes.append({"id": sid, "mood": scene["mood"], "audio": f"voiceover/{args.video}/{sid}.mp3", "durationMs": duration, "words": words})

    attach_avatars(args.video, scenes)
    GENERATED.mkdir(parents=True, exist_ok=True)
    srt = write_srt(args.video, scenes)
    manifest = {"video": args.video, "engine": args.engine, "scenes": scenes}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(s["durationMs"] for s in scenes) / 1000
    print(f"→ {manifest_path.relative_to(ROOT)} ({total:.1f}s of narration, engine={args.engine})")
    print(f"→ {srt.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
