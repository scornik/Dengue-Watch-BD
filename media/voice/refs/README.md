Put your reference voice clips here (git-ignored). One per mood used in `media/scripts/*.json`:

| File | Read this in the matching tone |
| --- | --- |
| `default.wav` + `default.txt` | used when a mood has no clip of its own |
| `serious.wav` + `serious.txt` | hook lines, the problem |
| `warm.wav` + `warm.txt` | how it works |
| `calm.wav` + `calm.txt` | explaining to officials |
| `confident.wav` + `confident.txt` | numbers, open source |
| `hopeful.wav` + `hopeful.txt` | the call to action |
| `energetic.wav` + `energetic.txt` | the hunter game |

Each `.wav`: 6–12 s, mono, quiet room, phone held 20 cm away, no music. Each `.txt`: the exact words you said.
IndicF5 copies the tone, pace and accent of the clip, so a sad clip gives sad narration. That is how you control emotion.
