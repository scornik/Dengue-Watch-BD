# thumbs worker: public thumbnails with faces and plates blurred

This worker creates the **only** publicly visible version of a user photo. Each run processes
two sources in order, up to `BATCH_SIZE` rows each:

| Source | Rows claimed | Original (private bucket) | Thumbnail in `public-thumbs` |
| --- | --- | --- | --- |
| Reports | `thumb_status = 'pending' AND ai_label <> 'not_relevant'` | `report-photos/{photo_path}` | `{report_id}.jpg` |
| Volunteer cleanup "after" photos | `thumb_status = 'pending' AND status = 'done' AND after_photo_path IS NOT NULL` | `cleanup-photos/{after_photo_path}` | `c/{cleanup_id}.jpg` |

On success the row gets `thumb_public_path = <key>, thumb_status = 'ok'`. Both sources share
one code path; a source is a small description (table, bucket, path column, filter, key
prefix) in `thumbs/worker.py`.

**Fail closed.** If decoding, detection, blurring or encoding fails for any reason,
including a missing model file, nothing is uploaded and the row is set to
`thumb_status = 'failed'`. An unblurred image is never published.

```
python -m thumbs.main [--batch-size N]
```

Exit code 0 means every processed row succeeded. Exit code 1 means some rows failed, some
will be retried, or a detector could not load, so the job shows up red. Exit code 4 means a
configuration error.

## Pipeline (`thumbs/pipeline.py`, pure; detectors injected)

1. The original is downloaded from the source's private bucket through the Storage REST API,
   using the service-role key.
2. Pillow decodes it and applies the **EXIF orientation**. The image then becomes a plain
   pixel array, which drops all metadata: EXIF including GPS, ICC and XMP. Very large images
   are capped at 4096 px on the long side.
3. **Detectors run on the full-resolution image**, before any downscale, so small faces and
   plates are not lost:
   - **Faces:** OpenCV **YuNet** (`cv2.FaceDetectorYN`, `face_detection_yunet_2023mar.onnx`
     from opencv_zoo, Apache-2.0). It runs at two scales (≤1600 px and ≤640 px) with a
     permissive score threshold (0.6).
   - **Number plates:** OpenCV's bundled `haarcascade_russian_plate_number.xml`. It runs at
     ≤3000 px and ≤1280 px with a low `minNeighbors`.
4. Every box is padded by 25% (at least 4 px) and made unrecognisable on the full-resolution
   image: coarse pixelation (1/16), then a strong Gaussian blur.
5. The image is downscaled to at most **320 px** on the long side, never upscaled.
6. It is encoded as a **progressive, optimised JPEG, quality 50, 4:2:0 chroma subsampling**,
   with no EXIF or ICC. These defaults keep storage and bandwidth minimal (typically a few
   KB to ~20 KB per photo). If the result exceeds **1 MB**, the quality drops in steps; if it
   still does not fit, the row fails.
7. The thumbnail is uploaded with `POST /storage/v1/object/public-thumbs/{key}`
   (`x-upsert: true`, `Content-Type: image/jpeg`). Then the worker sets
   `thumb_public_path = '{key}', thumb_status = 'ok'` on the row.

**Outcomes per row:**

| Outcome | Causes | What happens |
| --- | --- | --- |
| `ok` | Thumbnail built and uploaded | Row set to `ok` with the public path |
| `failed` | No photo path; original missing (404, or 400 not_found); undecodable image; detector error or unavailable model; size limit | Row set to `failed`, `thumb_public_path = NULL`, nothing uploaded |
| retry | Network or 5xx error on download or upload | Row stays `pending` and is retried on the next run. After 3 consecutive transient errors the run stops early |

To re-queue failed rows after fixing a deployment:
`UPDATE reports SET thumb_status = 'pending' WHERE thumb_status = 'failed';` (same for
`cleanups`).

If the `cleanups` table does not exist yet (migration not applied), reports are still
processed; the run logs an error and exits 1.

## Concurrency

Rows are claimed one per transaction (reports ordered by `created_at`, cleanups by
`done_at`):

```
SELECT … FROM reports
 WHERE thumb_status = 'pending' AND ai_label <> 'not_relevant'
 ORDER BY created_at, id LIMIT 1
   FOR UPDATE SKIP LOCKED
```

The row lock is held only while that one photo is processed. Overlapping runs skip locked
rows, so a photo is never processed twice. Each run handles up to `BATCH_SIZE` rows per
source.

`ai_label <> 'not_relevant'` also skips rows whose `ai_label` is still `NULL`, meaning not yet
screened. They are picked up once they have a label.

## Limits (be honest in the UI)

- **Plate detection is a weak baseline.** The Haar cascade was trained on Russian plates.
  Bangladeshi plates use Bangla script on white or green plates, so recall will be imperfect.
  The multi-scale, low-threshold settings help but do not guarantee blurring.
- **Faces:** YuNet misses heavily occluded, tiny or extreme-angle faces.
- For both reasons, keep moderator review before thumbnails are shown widely. A
  Bangladesh-specific plate model is a good P3 follow-up; the `Detector` protocol makes it a
  drop-in.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | none | Postgres (selects and updates `reports` and `cleanups`) |
| `SUPABASE_URL` | yes | none | Supabase project URL for the Storage REST API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | none | Reads the private originals and writes the public thumbnails. Server-side secret |
| `YUNET_MODEL_PATH` | no | `/models/face_detection_yunet_2023mar.onnx` (downloaded into the image at build time) | Face model. If missing, every photo is marked failed |
| `BATCH_SIZE` | no | `50` | Maximum rows per source per run |
| `FACE_SCORE_THRESHOLD` | no | `0.6` | YuNet confidence. Lower values blur more |
| `THUMB_MAX_SIDE` | no | `320` | Thumbnail long side in px (min 16) |
| `THUMB_QUALITY` | no | `50` | Starting JPEG quality (1–95); progressive, optimised, 4:2:0 |
| `LOG_LEVEL` | no | `INFO` | Python log level |

## Schedule (Northflank cron)

The schedule is `*/5 * * * *`, every 5 minutes. The command is `python -m thumbs.main`. See
`northflank.json`.

## Development

```
uv run --extra dev pytest     # stub detectors; DB tests skipped unless DATABASE_URL is set
uv run --extra dev ruff check . && uv run --extra dev ruff format --check .
```

The DB tests create and drop a throwaway schema (`thumbs_test_*`) with `reports` and
`cleanups` tables mirroring the contract, because the SKIP LOCKED tests need two sessions. The YuNet model is not needed for tests.

OpenCV is pinned below 5 because 5.x no longer bundles the Haar cascade files.
