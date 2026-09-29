# DengueWatch BD - photo screening API (and training/export tooling). Build context: workers/detector
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    YOLO_CONFIG_DIR=/tmp/ultralytics

# OpenCV (pulled in by ultralytics) needs these shared libraries.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock requirements-train.txt ./
RUN uv sync --frozen --no-install-project \
 && uv pip install --python /opt/venv/bin/python \
      --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match \
      -r requirements-train.txt \
 && rm /usr/local/bin/uv

COPY detector ./detector

RUN useradd --create-home --uid 10001 app && mkdir -p /models && chown app /models
USER app

# Model weights are NOT baked in: mount them (e.g. a Northflank volume) at /models/best.pt.
# DETECTOR_TOKEN and other secrets are injected at run time.
EXPOSE 8080
CMD ["uvicorn", "--factory", "detector.serve:app_factory", "--host", "0.0.0.0", "--port", "8080"]
