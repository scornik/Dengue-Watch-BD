# আপনার কণ্ঠ ও মুখ রেকর্ড করার নির্দেশিকা · Recording your voice and face

Nothing is trained on your data and nothing is uploaded to GitHub. The Colab notebook
(`media/colab/voice_and_avatar.ipynb`) reads your clips while it runs and forgets them when the session ends.

- **Voice:** AI4Bharat IndicF5 copies your voice, accent, pace and emotion from a short clip each time it speaks a line.
- **Face:** LatentSync keeps your real video (head movement, blinks, expression) and only redraws your mouth to match each line.

The quality of the result is the quality of your recordings. Twenty minutes of care here is worth more than any setting.

---

## ১. কণ্ঠ · Voice (6 clips, about 10 minutes)

**Where:** the quietest room you have. Close windows, switch off the fan and AC for a minute. Soft furniture (bed, curtains) is better than a bare room, because it kills echo.

**How:** a phone's voice recorder app is enough. Hold the phone about 20 cm (a hand's width) from your mouth, slightly below it, so your breath doesn't hit the mic. Record each sentence 2–3 times and keep the best take.

**What:** read **exactly** these sentences, each in the feeling named. The notebook already knows the words, so don't change any.

| ফাইলের নাম | অনুভূতি | বাক্য |
| --- | --- | --- |
| `serious` | গম্ভীর, চিন্তিত: as when you tell someone your wife is in hospital | আমাদের চারপাশে জমে থাকা পানিতেই জন্মায় এডিস মশা। প্রতিদিন অনেক মানুষ ডেঙ্গুতে আক্রান্ত হচ্ছেন, হাসপাতালে জায়গা নেই। |
| `warm` | আন্তরিক: explaining to a neighbour over tea | কাজটা খুব সহজ। ফোনে একটা ছবি তুলুন, মানচিত্রে জায়গাটা দেখিয়ে দিন, তারপর পাঠিয়ে দিন। এক মিনিটও লাগে না। |
| `calm` | শান্ত, পরিষ্কার: explaining to an official | প্রতিটি রিপোর্টে ছবি, অবস্থান আর পাত্রের ধরন থাকে। সব তথ্য সবার জন্য খোলা, যে কেউ দেখে নিতে পারেন। |
| `confident` | আত্মবিশ্বাসী | এই প্ল্যাটফর্ম ওপেন সোর্স। প্রতিটি ওয়ার্ডের অগ্রগতি সবাই দেখতে পান, আর তথ্য বিনা মূল্যে ডাউনলোড করা যায়। |
| `hopeful` | আশাবাদী | আমরা সবাই মিলে চেষ্টা করলে এই মশাকে থামানো সম্ভব। আজই আপনার বাড়ির আশেপাশে একবার খুঁজে দেখুন। |
| `energetic` | উৎসাহী, হাসিমুখে | চলুন শিকারে নামি! কাছের জায়গাটা খুঁজে নিন, পানি ফেলে দিন, ছবি তুলুন আর পয়েন্ট জিতে নিন! |

Save them as `serious.m4a`, `warm.m4a` and so on (any audio format works).

**Tips**
- Talk, don't read. Look at the sentence, then look away and say it.
- Keep 1 second of silence before and after. The notebook trims it.
- No music, TV or people talking in the background. The model copies background noise too.
- Use the same room and the same phone for all six, so the voice sounds like one person.
- The `serious` clip drives your story's first lines. Say it the way you actually feel about it.

## ২. মুখ · Face video (one clip, about 5 minutes)

LatentSync redraws only your mouth, so everything else in this clip is what people will see.

| | Do | Avoid |
| --- | --- | --- |
| Camera | Phone on a stand or books, at eye level, 1080p, 30 fps, **portrait** for the story video | Hand-held, selfie stick, looking down at the phone |
| Light | Facing a window in daylight, or a lamp behind the phone | Window behind you (dark face), ceiling light only (eye shadows), mixed colours |
| Framing | Head and shoulders, eyes a third of the way down, some space above the head | Face cut off, too close, too far |
| Face | Fully visible, mouth clear, glasses OK if no glare | Mask, sunglasses, hand or mic in front of the mouth, beard covering lips completely |
| Background | Plain wall, bookshelf, your workspace | Busy patterns, moving people, a TV |
| Length | 30–60 s of **talking naturally** about anything, e.g. tell the story in your own words | Silent, frozen face, reading from a screen beside the lens |

Your head movement, blinks and expressions are kept, so be natural: nod, pause, look into the lens.
If the clip is shorter than a line, LatentSync loops it. 30–60 s avoids visible loops.

Save as `me.mp4` (or `.mov`).

## ৩. চালানো · Run it

1. Open `media/colab/voice_and_avatar.ipynb` in Google Colab:
   <https://colab.research.google.com/github/scornik/Dengue-Watch-BD/blob/claude/affectionate-feynman-lr76e4/media/colab/voice_and_avatar.ipynb>
   (after the branch is merged, replace the branch name with `main`).
2. **Runtime → Change runtime type → T4 GPU** (free) or L4/A100 (Colab Pro, sharper lips).
3. Make a free Hugging Face account, open <https://huggingface.co/ai4bharat/IndicF5>, accept the terms, and create a read token (Settings → Access tokens).
4. Run the cells top to bottom. You upload the six voice clips at step 2b, paste the token at step 3, and upload `me.mp4` at step 6.
5. Listen at step 5b. If a line sounds wrong, redo just that one at 5c (each run is different).
6. Step 8 downloads the finished MP4s and `.srt` subtitle files.

Time on a free T4: about 5 min to install, 10 min for all voices, 30–60 min for lip-sync, 30–45 min to render three videos.

## ৪. প্রকাশের আগে · Before you post

- Watch each video once with sound, once muted.
- Write in the post text: **"ভয়েস ও ঠোঁট মেলানো এআই দিয়ে তৈরি"**. Meta requires AI labels on realistic AI-made video, and a transparency project should label it anyway.
- For the story itself, the most convincing version is still a plain phone recording of you saying it. You can drop that file in place of the generated one.
- Keep your voice clips and face video private. Anyone who has them can make you say anything.
