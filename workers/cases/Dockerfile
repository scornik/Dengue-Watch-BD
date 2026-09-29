# DengueWatch BD - daily case-count job. Build context: workers/cases
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
# Runtime dependencies only (no "dev" extra). No secrets are baked in: DATABASE_URL etc.
# are injected by Northflank at run time.
RUN uv sync --frozen --no-install-project && rm /usr/local/bin/uv

COPY cases ./cases

RUN useradd --create-home --uid 10001 app
USER app

CMD ["python", "-m", "cases.main"]
