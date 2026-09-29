# DengueWatch BD - public thumbnail job (faces + plates blurred). Build context: workers/thumbs
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    YUNET_MODEL_PATH=/models/face_detection_yunet_2023mar.onnx

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project && rm /usr/local/bin/uv

# YuNet face detector from opencv_zoo (Apache-2.0), fetched at build time (Git LFS media URL).
# The build fails if the download is missing or is an LFS pointer instead of the model.
ARG YUNET_URL=https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
RUN mkdir -p /models \
 && python -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
      "$YUNET_URL" "$YUNET_MODEL_PATH" \
 && python -c "import os, sys, cv2; p = sys.argv[1]; assert os.path.getsize(p) > 100_000, 'bad model'; cv2.FaceDetectorYN.create(p, '', (320, 320))" \
      "$YUNET_MODEL_PATH"

COPY thumbs ./thumbs

RUN useradd --create-home --uid 10001 app
USER app

# No secrets are baked in: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are injected.
CMD ["python", "-m", "thumbs.main"]
