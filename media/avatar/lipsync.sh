#!/usr/bin/env bash
# Lip-sync your own recorded face video to each scene's narration with LatentSync 1.6
# (ByteDance, Apache-2.0). Needs an NVIDIA GPU with 18 GB+ VRAM: Colab L4/A100, RunPod, Lambda.
#
#   bash media/avatar/lipsync.sh story  media/avatar/me.mp4
#   bash media/avatar/lipsync.sh citizen media/avatar/me.mp4 hook cta   # only some scenes
#
# me.mp4: 20-60 s of you looking at the camera, talking naturally (any words), good light, face
# unobstructed, 1080p, 25-30 fps. LatentSync only re-draws the mouth, so your real head movement,
# blinking and expression are kept; that is why this looks more natural than one-photo avatars.
#
# Output: media/video/public/avatar/<video>/<scene>.mp4, then the script links them into the manifest.
set -euo pipefail

VIDEO=${1:?video id, e.g. story}
FACE=$(realpath "${2:?path to your face recording}")
shift 2
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${LATENTSYNC_DIR:-$ROOT/avatar/.latentsync}
OUT=$ROOT/video/public/avatar/$VIDEO
mkdir -p "$OUT"

if [ ! -d "$WORK" ]; then
  git clone --depth 1 https://github.com/bytedance/LatentSync "$WORK"
  (cd "$WORK" && source setup_env.sh)   # installs requirements + downloads LatentSync-1.6 checkpoints
fi

SCENES=("$@")
if [ ${#SCENES[@]} -eq 0 ]; then
  mapfile -t SCENES < <(python3 -c "import json,sys;print('\n'.join(s['id'] for s in json.load(open('$ROOT/video/src/generated/$VIDEO.json'))['scenes']))")
fi

for SCENE in "${SCENES[@]}"; do
  AUDIO=$ROOT/video/public/voiceover/$VIDEO/$SCENE.mp3
  [ -f "$AUDIO" ] || { echo "no narration for $SCENE: run media/voice/narrate.py $VIDEO first"; exit 1; }
  WAV=$(mktemp --suffix .wav)
  ffmpeg -y -loglevel error -i "$AUDIO" -ar 16000 -ac 1 "$WAV"
  echo "▶ $VIDEO/$SCENE"
  (cd "$WORK" && python -m scripts.inference \
    --unet_config_path configs/unet/stage2_512.yaml \
    --inference_ckpt_path checkpoints/latentsync_unet.pt \
    --inference_steps 30 \
    --guidance_scale 1.5 \
    --enable_deepcache \
    --video_path "$FACE" \
    --audio_path "$WAV" \
    --video_out_path "$OUT/$SCENE.mp4")
  rm -f "$WAV"
done

"$ROOT/voice/.venv/bin/python" "$ROOT/voice/narrate.py" "$VIDEO" --attach-avatars 2>/dev/null \
  || python3 "$ROOT/voice/narrate.py" "$VIDEO" --attach-avatars
