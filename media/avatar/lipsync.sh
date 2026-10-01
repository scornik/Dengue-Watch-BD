#!/usr/bin/env bash
# Lip-sync your own recorded face video to each scene's narration with LatentSync
# (ByteDance, Apache-2.0). Runs on an NVIDIA GPU, e.g. in media/colab/voice_and_avatar.ipynb.
#
#   bash media/avatar/lipsync.sh story   media/avatar/me.mp4            # every scene
#   bash media/avatar/lipsync.sh citizen media/avatar/me.mp4 hook cta   # some scenes
#
#   LATENTSYNC_VERSION=1.6  (default) 512 px, sharp teeth and lips, needs ~18 GB VRAM (L4, A100)
#   LATENTSYNC_VERSION=1.5            256 px, softer mouth,          needs  ~8 GB VRAM (free T4)
#
# me.mp4: 20-60 s of you looking at the camera, talking naturally (any words), good light, face
# unobstructed. LatentSync only re-draws the mouth, so your real head movement, blinks and
# expressions stay. See media/RECORDING_GUIDE.md.
#
# Output: media/video/public/avatar/<video>/<scene>.mp4, then linked into the manifest.
set -euo pipefail

VIDEO=${1:?video id, e.g. story}
FACE=$(realpath "${2:?path to your face recording}")
shift 2
VERSION=${LATENTSYNC_VERSION:-1.6}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${LATENTSYNC_DIR:-$ROOT/avatar/.latentsync}
OUT=$ROOT/video/public/avatar/$VIDEO
mkdir -p "$OUT"

case $VERSION in
  1.6) CONFIG=configs/unet/stage2_512.yaml ;;
  1.5) CONFIG=configs/unet/stage2.yaml ;;
  *) echo "LATENTSYNC_VERSION must be 1.5 or 1.6"; exit 1 ;;
esac

if [ ! -d "$WORK" ]; then
  git clone --depth 1 https://github.com/bytedance/LatentSync "$WORK"
fi
# LatentSync pins Python 3.10-era wheels (mediapipe, torch 2.5.1), so it gets its own environment
# whatever Python the machine has. uv downloads Python 3.10 if needed.
command -v uv >/dev/null || pip install -q uv
PY=$WORK/.venv/bin/python
if [ ! -x "$PY" ]; then
  uv venv -q -p 3.10 "$WORK/.venv"
  uv pip install -q --python "$PY" -r "$WORK/requirements.txt" "huggingface_hub[cli]"
fi
CKPT=$WORK/checkpoints/v$VERSION
if [ ! -f "$CKPT/latentsync_unet.pt" ]; then
  "$WORK/.venv/bin/huggingface-cli" download "ByteDance/LatentSync-$VERSION" latentsync_unet.pt whisper/tiny.pt --local-dir "$CKPT"
fi
mkdir -p "$WORK/checkpoints/whisper"
cp -n "$CKPT/whisper/tiny.pt" "$WORK/checkpoints/whisper/tiny.pt" 2>/dev/null || true

SCENES=("$@")
if [ ${#SCENES[@]} -eq 0 ]; then
  mapfile -t SCENES < <(python3 -c "import json;print('\n'.join(s['id'] for s in json.load(open('$ROOT/video/src/generated/$VIDEO.json'))['scenes']))")
fi

for SCENE in "${SCENES[@]}"; do
  AUDIO=$ROOT/video/public/voiceover/$VIDEO/$SCENE.mp3
  [ -f "$AUDIO" ] || { echo "no narration for $SCENE: run media/voice/narrate.py $VIDEO first"; exit 1; }
  WAV=$(mktemp --suffix .wav)
  ffmpeg -y -loglevel error -i "$AUDIO" -ar 16000 -ac 1 "$WAV"
  echo "▶ $VIDEO/$SCENE (LatentSync $VERSION)"
  (cd "$WORK" && "$PY" -m scripts.inference \
    --unet_config_path "$CONFIG" \
    --inference_ckpt_path "$CKPT/latentsync_unet.pt" \
    --inference_steps 30 \
    --guidance_scale 1.5 \
    --enable_deepcache \
    --video_path "$FACE" \
    --audio_path "$WAV" \
    --video_out_path "$OUT/$SCENE.mp4")
  rm -f "$WAV"
done

python3 "$ROOT/voice/narrate.py" "$VIDEO" --attach-avatars 2>/dev/null \
  || "$ROOT/voice/.venv/bin/python" "$ROOT/voice/narrate.py" "$VIDEO" --attach-avatars
