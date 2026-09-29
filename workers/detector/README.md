# detector (P3): breeding-site photo classifier

This is tier 5 of the photo screening (see SPEC §5.3). It is a YOLO **classification** model
trained on photos that moderators have labelled. It is served behind the same JSON contract
the web app uses for its paid-API providers, under the provider name `"model"`.

> **Licence note.** Ultralytics YOLO is **AGPL-3.0**. That is compatible with this AGPL-3.0
> project, and its network-use clause (§13) only asks for what we already do: publish the
> source of the running service. Ultralytics sits in `requirements-train.txt`, not in
> `pyproject.toml`, so that CI and the unit tests do not install torch. If the project ever
> changes licence (for example to MIT for a partner), this component would need a
> differently licensed model stack.

## Pieces

| Module | What it does |
| --- | --- |
| `detector/labels.py` | Class list, moderator-label mapping and the deterministic hash split |
| `detector/export_dataset.py` | DB + Supabase Storage → Ultralytics classification folders |
| `detector/train.py` | Checks the dataset, then runs `yolo classify` fine-tuning (default `yolo11n-cls.pt`) |
| `detector/screen.py` | Turns probabilities into a verdict, plus the Ultralytics wrapper |
| `detector/serve.py` | FastAPI `POST /screen`, `GET /healthz` |

**Classes:** `tire, bucket_drum, ac_drip, construction, rooftop, flower_tub, drain, other,
not_relevant`. The site classes match `reports.site_type`.

**Label mapping** (`map_label`):

- A moderator label that is itself a class name wins, for example `drain`.
- A negative verdict (`not_relevant`, `rejected`, `spam`) maps to `not_relevant`.
- A positive verdict (`likely`, `verified`, …) maps to the reporter's `site_type`, or `other`
  if the site type is unknown.
- `unclear`, anything unrecognised, and reports with conflicting labels are left out.

**Split:** a report goes to `val` when `sha256(report_id) mod 100 < VAL_PCT`. A photo
therefore never moves between train and val as the dataset grows.

## Export → train

```
uv sync && uv pip install -r requirements-train.txt   # add --extra-index-url https://download.pytorch.org/whl/cpu for CPU torch
uv run python -m detector.export_dataset --out data/dataset --val-pct 20
uv run python -m detector.train --data data/dataset --model yolo11n-cls.pt --epochs 50
# -> runs/classify/train/weights/best.pt
```

The export query is `EXPORT_SQL` in `export_dataset.py`. It joins `reports` (`id`,
`photo_path`, `site_type`) with `ai_labels` (`report_id`, `moderator_label`). Adjust it if
the migrations name these columns differently.

Export behaviour:

- Photos are re-encoded as JPEG with EXIF orientation applied and **all metadata stripped**,
  then downscaled to at most 640 px.
- Files that already exist are skipped, so re-runs only fetch new photos.
- The `data/` and `runs/` folders are git-ignored.

**Exit criterion (SPEC P3):** the detector must beat the baseline on held-out Dhaka photos
before it replaces or augments the other tiers.

## Screening API

```
POST /screen
Authorization: Bearer $DETECTOR_TOKEN
{"image_url": "https://<project>.supabase.co/storage/v1/object/sign/..."}   or   {"image_base64": "<base64 or data: URL>"}

200 {"label": "likely" | "unclear" | "not_relevant", "score": 0.93, "site_type": "drain" | null}
```

**Response fields:**

- `score` is P(breeding site) = 1 − P(not_relevant).
- `label` is `not_relevant` if P(not_relevant) ≥ `DETECTOR_NOT_RELEVANT_THRESHOLD`.
  Otherwise it is `likely` if `score` ≥ `DETECTOR_LIKELY_THRESHOLD`, and `unclear` in every
  other case.
- `site_type` is the most probable site class. It is `null` when the label is `not_relevant`.

**Errors:**

| Status | Cause |
| --- | --- |
| 401 | Missing or incorrect bearer token |
| 403 | `image_url` host is not on the allow-list |
| 413 | Image too large |
| 422 | Bad payload or unreadable image |
| 502 | Image fetch failed |
| 503 | Model error |

**Security:**

- The token is compared in constant time, and the app refuses to start without one.
- `image_url` is fetched only from the allow-listed hosts, with redirects off and a size cap.
  This guards against SSRF. With no allowed host, only `image_base64` is accepted.

Run locally: `uv run uvicorn --factory detector.serve:app_factory --port 8080` (needs the
training requirements and weights).

## Environment

| Variable | Used by | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `DETECTOR_TOKEN` | serve | yes | none | Bearer token shared with the web app / Edge Function |
| `DETECTOR_WEIGHTS` | serve | no | `/models/best.pt` | Trained YOLO-cls weights |
| `DETECTOR_ALLOWED_HOSTS` | serve | no | Host of `SUPABASE_URL` | Comma-separated hosts allowed for `image_url` |
| `DETECTOR_LIKELY_THRESHOLD` | serve | no | `0.7` | Minimum P(site) for `likely` |
| `DETECTOR_NOT_RELEVANT_THRESHOLD` | serve | no | `0.7` | Minimum P(not_relevant) for `not_relevant` |
| `DETECTOR_MAX_IMAGE_MB` | serve | no | `10` | Upload/fetch size cap |
| `DETECTOR_IMGSZ` | serve | no | `224` | Inference image size |
| `DATABASE_URL` | export | yes | none | Postgres (reports + ai_labels) |
| `SUPABASE_URL` | export (and serve default allow-list) | yes for export | none | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | export | yes | none | Reads the private `report-photos` bucket. Server-side only |
| `DATASET_DIR` / `VAL_PCT` | export | no | `data/dataset` / `20` | Output folder and validation share |

## Deployment

- The screening API is a Northflank **service** (not a cron job) on port 8080, with a
  readiness check at `/healthz`. Weights live on a volume mounted at `/models`.
- Export and training run as a **manual job** in the same image. See `northflank.json`.
- The image runs as the non-root user `app` and contains no secrets or weights.

## Development

```
uv run --extra dev pytest     # stub model; no torch, network or DB needed
uv run --extra dev ruff check . && uv run --extra dev ruff format --check .
```
