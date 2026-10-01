# Launch videos

Three Bangla videos for the launch, built from code so they can be re-voiced, re-cut and re-rendered in minutes:

| Composition | Format | Who it is for | Length |
| --- | --- | --- | --- |
| `Citizen` | 1080×1920 (Reels, Shorts, WhatsApp status) | the public: what to report, privacy, the hunter game | ~1 min |
| `Govt` | 1920×1080 (presentations, YouTube, email) | city corporations, DGHS, ward councillors | ~1 min 45 s |
| `Story` | 1080×1920 | founder's personal story, your face and voice | under 1 min |

Everything is open source except Remotion itself, which is source-available and free for individuals and teams of up to 3 ([licence](https://www.remotion.dev/license)).

```
media/
  scripts/<video>.json     what is said, scene by scene, with a mood per scene
  voice/narrate.py         narration (draft or your cloned voice) + word-level captions + .srt
  voice/refs/              your reference voice clips (git-ignored)
  avatar/lipsync.sh        lip-syncs your recorded face video to the narration (GPU)
  video/                   Remotion project: motion graphics, transitions, captions
```

## 1. Script

Edit `scripts/citizen.json`, `scripts/govt.json` or `scripts/story.json`. Write narration for the ear:
spell out numbers (`ত্রিশ`, not `৩০`) and write acronyms in Bangla (`জিপিএস`, `এআই`). On-screen text lives in
`video/src/<video>/scenes.tsx` and is keyed to spoken words, so when you change a line, check the matching
`wordFrame(s, "…")` calls in that scene still find their word.

`story.json` is deliberately empty. Fill it with your own true story; the prompts in the file are the
questions journalists asked GhushSite's founders. Do not let anyone (or any AI) embellish it.

## 2. Voice

```bash
cd media/voice
python3 -m venv .venv && .venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt
.venv/bin/python narrate.py citizen          # draft voice, ~1 s per line on CPU
```

**Draft voice:** Meta MMS-TTS Bengali. It's fast and needs no GPU, but it's flat and its licence is
**CC-BY-NC-4.0**, so use it only for review, never for the published videos.

**Your cloned voice:** [AI4Bharat IndicF5](https://huggingface.co/ai4bharat/IndicF5), MIT. It's an open voice-cloning model
trained specifically on Bengali (general-purpose cloners such as XTTS-v2 and CosyVoice
don't support Bangla). It copies tone, pace and accent from a short
reference clip, so a Dhaka speaker's clip gives a Bangladeshi accent. Emotion comes from the clip too:
record one clip per mood (see `voice/refs/README.md`).

```bash
# on a GPU machine (Colab T4 is enough), after accepting the model terms on Hugging Face
pip install -r requirements-clone.txt && huggingface-cli login
python narrate.py citizen --engine indicf5
python narrate.py citizen --engine indicf5 --only hook   # redo one line until it sounds right
```

Only clone a voice with that person's explicit permission (it is also IndicF5's licence condition).

## 3. Captions

`narrate.py` writes them; there is no transcription step. We already know every word, so the
script is **force-aligned** to the audio with Meta's MMS aligner (torchaudio `MMS_FA`, Bangla via
`uroman`). The caption text is exactly the script and only the timing is computed. Whisper-style ASR
is still weak on Bangla and would put recognition errors on screen.

- The video shows word-by-word highlighted captions burnt in. Most people watch Reels muted.
- `video/out/<video>.bn.srt` is a separate subtitle file for Facebook/YouTube uploads (upload it as
  `Bengali`; Facebook expects a name like `citizen.bn_BD.srt`).
- Lines with a low alignment score are printed as `check: …`. Watch those words in the preview.

## 4. Talking head (optional, needs a GPU)

Record yourself: 20–60 s looking at the camera, natural head movement, good light, any words.
[LatentSync 1.6](https://github.com/bytedance/LatentSync) (ByteDance, Apache-2.0) re-draws only the
mouth to match each narration line. Your real face, blinks and expressions stay, which looks far
more natural than one-photo avatar models. It needs 18 GB VRAM (Colab L4/A100).

```bash
bash media/avatar/lipsync.sh story media/avatar/me.mp4     # every scene
bash media/avatar/lipsync.sh citizen media/avatar/me.mp4 hook cta
```

Clips land in `video/public/avatar/<video>/<scene>.mp4` (git-ignored) and are linked into the
manifest automatically. `Story` shows them full-screen; `Citizen` and `Govt` show a round bubble.
Scenes without a clip fall back to motion graphics.

**Label it.** If you publish an AI-voiced or lip-synced video of yourself, say so in the caption
("ভয়েস ও ঠোঁট মেলানো এআই দিয়ে তৈরি"). Meta requires an AI label on realistic AI-made video, and a
transparency project caught hiding that will lose the trust it needs. For the founder story,
the strongest option is still a real phone recording of you; use the clone for re-takes and the
feature videos.

## 5. Preview and render

```bash
cd media/video && npm i
npm run dev                     # Remotion Studio: scrub, tweak props (site URL, contact, name)
npm run render:citizen          # → out/citizen.mp4
npm run render:govt
npm run render:story
```

Durations follow the narration. Regenerate a voice and the timeline resizes itself.
The site URL and contact are props (`denguewatch.org.bd` is the placeholder from `docs/DEPLOYMENT.md`).
The scorecard numbers in `Govt` are labelled "নমুনা তথ্য" (sample data); replace them with real pilot
numbers once you have them.

Agent skills for this project come from [remotion-dev/skills](https://github.com/remotion-dev/skills) and
are vendored in `.claude/skills/remotion-*`.
