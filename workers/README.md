# DengueWatch BD workers (Python)

These are the scheduled and background jobs that run outside Vercel/Supabase, on Northflank.
Each directory is an independent [uv](https://docs.astral.sh/uv/) project with the following
files:

- `pyproject.toml`: Python ≥ 3.12, `dev` extra for pytest and ruff, `uv.lock`
- `Dockerfile`: `python:3.12-slim`, non-root user, no secrets baked in
- `.env.example`
- `northflank.json`
- `README.md`

| Worker | What it does | Runs | Schedule (UTC) |
| --- | --- | --- | --- |
| [`cases/`](cases/) | Scrapes the DGHS daily dengue bulletin (EN/BN, HTML/text/PDF) into `case_counts`. Manual admin rows win | `python -m cases.main` | `0 4 * * *` (10:00 Asia/Dhaka) |
| [`satellite/`](satellite/) | Sentinel-2 NDVI/MNDWI/NDBI, Landsat LST, Open-Meteo rain, report density and cases give a per-ward score and level in `ward_risk` | `python -m satellite.main` | `0 21 * * 0` (Mon 03:00 Asia/Dhaka) |
| [`thumbs/`](thumbs/) | Public report thumbnails with faces and plates blurred (fail closed) | `python -m thumbs.main` | `*/5 * * * *` |
| [`detector/`](detector/) | P3: YOLO classifier on moderator-labelled photos, and `POST /screen` API | Service `uvicorn --factory detector.serve:app_factory`; manual export/train job | — |

The database contract (tables `wards`, `reports`, `case_counts`, `ward_risk`, `ai_labels`) is
owned by the Supabase migrations. Workers connect with `DATABASE_URL` (psycopg 3). Storage
access uses the Supabase Storage REST API with `SUPABASE_SERVICE_ROLE_KEY`, which is
server-side only.

## Lint and test

```
make -C workers check                              # all workers: ruff check + format check + pytest
cd workers/<name> && uv run --extra dev pytest     # one worker
cd workers/<name> && uv run --extra dev ruff check . && uv run --extra dev ruff format --check .
```

**Tests need no network.** HTTP calls are mocked and rasters are synthetic.

**DB tests** are skipped unless `DATABASE_URL` is set. They use `TEMP` tables or a throwaway
schema, never the real tables, so pointing them at a local Supabase DB is safe. The
`satellite` ward/report query test also needs PostGIS.

## Licences

The project is AGPL-3.0. Every dependency is permissive, with one exception:

- **Ultralytics** (AGPL-3.0, compatible). It is used only by `detector/`, in
  `requirements-train.txt`.

Other notes:

- **YuNet** comes from opencv_zoo (Apache-2.0) and is downloaded at image build time.
- The InfoDengue **AlertTools** alert-level idea is CC0. Ideas only; no code was copied.
- No GPL code is copied.
