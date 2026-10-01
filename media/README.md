# Launch videos

Three Bangla videos for the launch, built from code so they can be re-voiced, re-cut and re-rendered in minutes:

| Composition | Format | For | What it shows |
| --- | --- | --- | --- |
| `Citizen` | 1080×1920 (Reels, Shorts, WhatsApp status) | the public | Step-by-step: open the site, report in 3 steps, then hunt: find a spot, claim it, destroy it, earn points |
| `Govt` | 1920×1080 (YouTube, presentations, email) | city corporations | An invitation: volunteers run it today; a city corporation can appoint ward admins and inspectors |
| `Story` | 1080×1920 | everyone | The founder's own story, in their face and voice |

Every app screen in the videos is a **real screen recording of the app** (`capture/`), not a mock-up.

**Fastest path to the finished videos:** follow [`RECORDING_GUIDE.md`](RECORDING_GUIDE.md), then run
[`colab/voice_and_avatar.ipynb`](colab/voice_and_avatar.ipynb) in Google Colab. It clones your voice, lip-syncs your face, renders
and downloads the MP4s ([open in Colab](https://colab.research.google.com/github/scornik/Dengue-Watch-BD/blob/claude/affectionate-feynman-lr76e4/media/colab/voice_and_avatar.ipynb)).

```
media/
  scripts/<video>.json      what is said, scene by scene, with a mood per scene
  voice/narrate.py          narration (draft or your cloned voice) + word-level captions + .srt
  voice/refs/               your reference voice clips (git-ignored)
  avatar/lipsync.sh         lip-syncs your recorded face video to the narration (GPU)
  capture/                  records the real app (Playwright) against a local stack
  colab/                    one notebook that runs voice → lip-sync → render on a free GPU
  video/                    Remotion project: motion graphics, transitions, captions
```

Remotion is source-available and free for individuals and teams of up to 3 ([licence](https://www.remotion.dev/license)). Everything else is open source.

## English version (Kokoro voice + Bangla subtitles)

The three videos also exist with **English narration** (Kokoro TTS, voice `am_adam` by default), English
word-by-word captions with the **Bangla translation of each line** above them, background music that ducks under
the voice, and sound effects on transitions and call-outs. Compositions: `CitizenEN`, `GovtEN`, `StoryEN`.

```bash
cd media/voice && .venv/bin/pip install "kokoro>=0.9.4" && apt-get install espeak-ng   # once
.venv/bin/python narrate_en.py citizen                      # or govt, story; --voice am_michael to change
KOKORO_URL=http://localhost:8880 .venv/bin/python narrate_en.py citizen   # use a Kokoro-FastAPI Docker container
cd ../video && npx remotion render CitizenEN out/citizen-en.mp4
```

Scripts are `scripts/en/*.json`: each scene is a list of `{en, bn}` lines. Write short sentences with everyday
words; `...` inside a line becomes a real breath, and each scene's `mood` sets the pace and the pause after every
line (Kokoro has no emotion control, so timing carries the feeling). It also writes `video/out/<video>.en.srt` and
`.bn.srt` for uploads. Ready-to-post text for every platform: [`social/posts.md`](social/posts.md). Music and sound
credits: `video/public/CREDITS.md`.

Voice quality: Kokoro's own list grades `am_adam` F+, and `am_michael`, `am_fenrir` and `am_puck` C+. Compare them
side by side in `video/out/voices/` (generated, not committed).

## 1. Script

Edit `scripts/*.json`. Write narration for the ear: spell out numbers (`তিন`, not `৩`) and write acronyms in Bangla
(`জিপিএস`). On-screen titles and call-outs live in `video/src/<video>/scenes.tsx` and are keyed to spoken words
with `wordFrame(s, "…")`, so when you change a line, check those words still appear in it.

What the videos may and may not claim:
- No government body is involved yet. Never say reports go to a city corporation team. The `Govt` video is an invitation.
- Every feature claim must match shipped code (`docs/SPEC.md` §4.2). Demo screens are labelled "ডেমো তথ্য".
- `story.json` is the founder's own words, translated. Do not embellish it.

## 2. Voice

```bash
cd media/voice
python3 -m venv .venv && .venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt
.venv/bin/python narrate.py citizen          # draft voice, ~1 s per line on CPU
```

- **Draft voice:** Meta MMS-TTS Bengali. It's fast, but flat, and the licence is **CC-BY-NC-4.0**, so use it only to review timing.
- **Your voice:** [AI4Bharat IndicF5](https://huggingface.co/ai4bharat/IndicF5) (MIT). It's an open voice-cloning model trained for
  Bengali; general-purpose cloners such as XTTS-v2 and CosyVoice don't support Bangla. It copies tone, pace, accent and
  emotion from a short reference clip, so each scene's `mood` picks the clip you recorded in that feeling
  (`RECORDING_GUIDE.md`). It needs a GPU and Python 3.10; the Colab notebook sets this up.

```bash
python narrate.py story --engine indicf5
python narrate.py story --engine indicf5 --only wife   # redo one line until it sounds right
```

Only clone a voice with that person's explicit permission. That's also IndicF5's licence condition.

## 3. Captions

`narrate.py` writes them, with no transcription step. We already know every word, so the script is
**force-aligned** to the audio with Meta's MMS aligner (torchaudio `MMS_FA`, Bangla via `uroman`). The caption text is
exactly the script and only the timing is computed. Whisper-style ASR is still weak on Bangla.

- The videos burn in word-by-word highlighted captions. Most people watch Reels muted.
- `video/out/<video>.bn.srt` is a separate subtitle file for uploads (Facebook expects `name.bn_BD.srt`).
- Words with a low alignment score are printed as `check: …`. Watch those in the preview.

## 4. App screen recordings

`capture/record.mjs` drives the real web app in a 390×844 phone viewport and records it at 2× (780×1688). Taps are
shown as a marigold ring, and named marks are written to `video/src/generated/app-clips.json`. Each video scene plays
the segment between two marks, sped up or slowed down slightly to fit the narration.

It runs against a **local** stack only (it refuses anything else), so nothing is written to production:

```bash
supabase start
bash media/capture/setup.sh            # reset, demo data, demo spots with photos around Mirpur 10
                                       # (WARDS_GEOJSON=wards.geojson bash … loads real ward boundaries)
eval "$(supabase status -o env)"
printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$API_URL" "$ANON_KEY" > apps/web/.env.local
pnpm --filter web build && pnpm --filter web start -p 3100 &
cd media/capture && npm ci
SUPABASE_URL=$API_URL ANON_KEY=$ANON_KEY SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY node record.mjs   # or: node record.mjs hunt
```

Flows: `report` (home → photo → pin → details → thank-you), `hunt` (spot list → claim → after photo → XP → leaderboard),
`public` (a spot, the risk map, a ward scorecard) and `staff` (inspector queue and closing with a photo, weekly digest,
admin, open data). Sign-in, claims, cleanups, uploads and the leaderboard all run against the real local backend. Only the
`submit-report` Edge Function is answered in the browser, so recording works even where Edge Functions can't start.
Re-record after any UI change; the videos pick up the new clips automatically.

Demo photos are CC BY 2.0 (`capture/photos/CREDITS.md`); the videos credit them on screen.

## 5. Talking head (optional, GPU)

[LatentSync](https://github.com/bytedance/LatentSync) (ByteDance, Apache-2.0) keeps your real video (head movement, blinks,
expressions) and redraws only the mouth for each line. That looks far more natural than one-photo avatar models.

```bash
bash media/avatar/lipsync.sh story media/avatar/me.mp4                         # LatentSync 1.6, 18 GB VRAM
LATENTSYNC_VERSION=1.5 bash media/avatar/lipsync.sh story media/avatar/me.mp4  # 1.5, 8 GB, free Colab T4
```

Clips land in `video/public/avatar/<video>/<scene>.mp4` (git-ignored) and are linked into the manifest. `Story` shows them
full-screen (and as a bubble over the app in the "build" scene); `Citizen` and `Govt` show a round bubble.

**Label it.** Write "ভয়েস ও ঠোঁট মেলানো এআই দিয়ে তৈরি" in the post. Meta requires AI labels on realistic AI-made video.

## 6. Preview and render

```bash
cd media/video && npm ci
npm run dev                     # Remotion Studio: scrub, change props (site URL, contact, name)
npm run render:citizen          # → out/citizen.mp4
npm run render:govt
npm run render:story
```

Durations follow the narration: regenerate a voice and the timeline resizes itself. Props: `siteUrl`
(default `dengue-watch-bd.vercel.app`), `contact` (Govt, empty hides it), `name`/`role` (Story lower-third, empty hides it).

Agent skills for this project come from [remotion-dev/skills](https://github.com/remotion-dev/skills), vendored in
`.claude/skills/remotion-*`.
