"""English narration with Kokoro, plus word-timed English captions and line-timed Bangla subtitles.

    python narrate_en.py citizen                       # Kokoro in this Python env (CPU is fine)
    python narrate_en.py citizen --voice am_michael    # try another voice
    KOKORO_URL=http://localhost:8880 python narrate_en.py citizen   # your Kokoro-FastAPI Docker container

Reads   media/scripts/en/<video>.json   (scenes → lines, each {en, bn})
Writes  media/video/public/voiceover/en/<video>/<scene>.mp3
        media/video/src/generated/en/<video>.json   (read by the *EN compositions)
        media/video/out/<video>.en.srt and <video>.bn.srt

Kokoro has no emotion control, so delivery comes from the writing and the timing: every line is
spoken on its own, "..." inside a line becomes a real breath, each mood has its own pace, and the
pause after a line is longer for serious moments than for energetic ones.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts" / "en"
PUBLIC = ROOT / "video" / "public" / "voiceover" / "en"
GENERATED = ROOT / "video" / "src" / "generated" / "en"
OUT = ROOT / "video" / "out"
SR = 24_000

# mood → (speed, breath at "..." in s, pause after the line in s)
MOOD = {
    "serious": (0.86, 0.45, 0.75),
    "calm": (0.92, 0.35, 0.55),
    "warm": (0.94, 0.35, 0.5),
    "confident": (0.97, 0.3, 0.45),
    "hopeful": (0.9, 0.4, 0.65),
    "energetic": (1.02, 0.25, 0.35),
}
LEAD, TAIL = 0.15, 0.45  # seconds before the first word and after the last line of a scene
FPS, TRANSITION_FRAMES = 30, 12  # must match media/video/src/timeline.ts


class LocalKokoro:
    def __init__(self) -> None:
        from kokoro import KPipeline

        self.pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

    def speak(self, text: str, voice: str, speed: float) -> tuple[np.ndarray, list[dict]]:
        audio, words, offset = [], [], 0.0
        for r in self.pipe(text, voice=voice, speed=speed):
            a = r.audio.numpy()
            for t in r.tokens or []:
                if t.start_ts is None or t.end_ts is None:
                    continue
                if not re.search(r"\w", t.text):  # punctuation: glue to the previous word
                    if words:
                        words[-1]["text"] += t.text
                    continue
                words.append({"text": t.text, "start": offset + t.start_ts, "end": offset + t.end_ts})
            audio.append(a)
            offset += len(a) / SR
        return np.concatenate(audio), words


class HttpKokoro:
    """Kokoro-FastAPI (github.com/remsky/Kokoro-FastAPI), e.g. `docker run -p 8880:8880
    ghcr.io/remsky/kokoro-fastapi-cpu`. Uses its captioned endpoint for word timestamps."""

    def __init__(self, url: str) -> None:
        self.url = url.rstrip("/")

    def speak(self, text: str, voice: str, speed: float) -> tuple[np.ndarray, list[dict]]:
        body = json.dumps({"model": "kokoro", "input": text, "voice": voice, "speed": speed, "response_format": "wav", "stream": False}).encode()
        req = urllib.request.Request(f"{self.url}/dev/captioned_speech", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as res:
            data = json.loads(res.read())
        import base64

        audio, sr = sf.read(io.BytesIO(base64.b64decode(data["audio"])), dtype="float32")
        if sr != SR:
            raise SystemExit(f"expected {SR} Hz from Kokoro, got {sr}")
        words = []
        for t in data.get("timestamps", []):
            w = t.get("word", "")
            if not re.search(r"\w", w):
                if words:
                    words[-1]["text"] += w
                continue
            words.append({"text": w, "start": t["start_time"], "end": t["end_time"]})
        return audio, words


def trim(a: np.ndarray) -> tuple[np.ndarray, float]:
    """Cut silence at both ends; return audio and seconds removed from the start."""
    env = np.abs(a)
    idx = np.where(env > max(env.max() * 0.02, 1e-4))[0]
    if not len(idx):
        return a, 0.0
    start = max(idx[0] - int(0.02 * SR), 0)
    return a[start : idx[-1] + int(0.06 * SR)], start / SR


def silence(sec: float) -> np.ndarray:
    return np.zeros(int(SR * sec), dtype=np.float32)


def speak_line(tts, text: str, voice: str, mood: str) -> tuple[np.ndarray, list[dict]]:
    speed, breath, _ = MOOD.get(mood, MOOD["warm"])
    parts = [p.strip() for p in text.split("...") if p.strip()]
    audio, words, t = [], [], 0.0
    for i, part in enumerate(parts):
        a, ws = tts.speak(part, voice, speed)
        a, cut = trim(a.astype(np.float32))
        for w in ws:
            words.append({"text": w["text"], "start": t + max(w["start"] - cut, 0), "end": t + max(w["end"] - cut, 0)})
        audio.append(a)
        t += len(a) / SR
        if i < len(parts) - 1:
            audio.append(silence(breath))
            t += breath
            if words:
                words[-1]["text"] += "…" if not words[-1]["text"].endswith((",", ".", "!", "?")) else ""
    return np.concatenate(audio), words


def to_mp3(a: np.ndarray, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.wav")
    sf.write(tmp, a, SR)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-ar", "44100", "-ac", "1", "-b:a", "160k", str(dest)], check=True)
    tmp.unlink()


def srt(path: Path, cues: list[tuple[float, float, str]]) -> None:
    def ts(ms: float) -> str:
        ms = max(0, round(ms))
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

    path.write_text("".join(f"{n}\n{ts(a)} --> {ts(b)}\n{t}\n\n" for n, (a, b, t) in enumerate(cues, 1)), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--voice", default=os.environ.get("KOKORO_VOICE", "am_adam"))
    p.add_argument("--only", help="regenerate one scene id")
    args = p.parse_args()

    script = json.loads((SCRIPTS / f"{args.video}.json").read_text(encoding="utf-8"))
    tts = HttpKokoro(os.environ["KOKORO_URL"]) if os.environ.get("KOKORO_URL") else LocalKokoro()
    manifest_path = GENERATED / f"{args.video}.json"
    previous = {s["id"]: s for s in json.loads(manifest_path.read_text())["scenes"]} if manifest_path.exists() else {}

    scenes = []
    for scene in script["scenes"]:
        sid, mood = scene["id"], scene["mood"]
        if args.only and sid != args.only and sid in previous:
            scenes.append(previous[sid])
            continue
        pause = MOOD.get(mood, MOOD["warm"])[2]
        audio, words, lines, t = [silence(LEAD)], [], [], LEAD
        for i, line in enumerate(scene["lines"]):
            a, ws = speak_line(tts, line["en"], args.voice, mood)
            for w in ws:
                words.append({"text": w["text"], "startMs": round((t + w["start"]) * 1000), "endMs": round((t + w["end"]) * 1000), "confidence": 1})
            lines.append({"en": line["en"].replace("...", "…"), "bn": line["bn"], "startMs": round(t * 1000), "endMs": round((t + len(a) / SR) * 1000)})
            audio.append(a)
            t += len(a) / SR
            gap = pause if i < len(scene["lines"]) - 1 else TAIL
            audio.append(silence(gap))
            t += gap
        for a_, b_ in zip(words, words[1:]):
            a_["endMs"] = max(a_["endMs"], min(b_["startMs"], a_["endMs"] + 250))
        full = np.concatenate(audio)
        full = full / (np.abs(full).max() or 1) * 0.89
        to_mp3(full, PUBLIC / args.video / f"{sid}.mp3")
        dur = round(len(full) / SR * 1000)
        print(f"{sid:10} {dur / 1000:5.1f}s  {len(words)} words  {len(lines)} lines")
        scenes.append({"id": sid, "mood": mood, "audio": f"voiceover/en/{args.video}/{sid}.mp3", "durationMs": dur, "words": words, "lines": lines})

    GENERATED.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({"video": args.video, "engine": f"kokoro:{args.voice}", "scenes": scenes}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # Subtitle files on the final timeline (scenes overlap by the transition, padded by it: net = audio length).
    en, bn, start = [], [], 0
    for s in scenes:
        off = start / FPS * 1000
        for ln in s["lines"]:
            en.append((off + ln["startMs"], off + ln["endMs"], ln["en"]))
            bn.append((off + ln["startMs"], off + ln["endMs"], ln["bn"]))
        start += math.ceil(s["durationMs"] / 1000 * FPS)
    OUT.mkdir(parents=True, exist_ok=True)
    srt(OUT / f"{args.video}.en.srt", en)
    srt(OUT / f"{args.video}.bn.srt", bn)
    print(f"→ {manifest_path.relative_to(ROOT)} ({sum(s['durationMs'] for s in scenes) / 1000:.1f}s, voice {args.voice})")


if __name__ == "__main__":
    sys.exit(main())
