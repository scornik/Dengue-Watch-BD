"""CLI: build public thumbnails for pending reports.

    python -m thumbs.main [--batch-size N]

Exit codes: 0 ok, 1 some rows failed/retried or a detector is unavailable (so the job shows
up red), 4 bad configuration.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

import httpx

from .detectors import BrokenDetector, default_detectors
from .pipeline import ThumbSettings
from .storage import SOURCE_BUCKET, THUMB_BUCKET, StorageConfig, download, upload_jpeg
from .worker import Outcome, handle_report, run_batch

log = logging.getLogger("thumbs")

DEFAULT_YUNET = "/models/face_detection_yunet_2023mar.onnx"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m thumbs.main")
    p.add_argument("--batch-size", type=int, default=int(os.environ.get("BATCH_SIZE", "50")))
    args = p.parse_args(argv)
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is not set")
        return 4
    try:
        storage = StorageConfig.from_env()
    except RuntimeError as exc:
        log.error("%s", exc)
        return 4

    detectors = default_detectors(
        os.environ.get("YUNET_MODEL_PATH", DEFAULT_YUNET),
        face_score=float(os.environ.get("FACE_SCORE_THRESHOLD", "0.6")),
    )
    broken = [d for d in detectors if isinstance(d, BrokenDetector)]
    for d in broken:
        log.error("%s detector unavailable (%s); photos will be marked failed", d.name, d.error)
    settings = ThumbSettings(
        max_side=int(os.environ.get("THUMB_MAX_SIDE", "480")),
        quality=int(os.environ.get("THUMB_QUALITY", "75")),
    )

    import psycopg

    with httpx.Client(timeout=60) as client, psycopg.connect(dsn) as conn:

        def handler(report_id: str, photo_path: str | None) -> Outcome:
            return handle_report(
                report_id,
                photo_path,
                fetch=lambda path: download(client, storage, SOURCE_BUCKET, path),
                upload=lambda key, data: upload_jpeg(client, storage, THUMB_BUCKET, key, data),
                detectors=detectors,
                settings=settings,
            )

        counts = run_batch(conn, args.batch_size, handler)
    log.info("done: %s", dict(counts))
    return 1 if broken or counts["failed"] or counts["retry"] else 0


if __name__ == "__main__":
    sys.exit(main())
