"""CLI: build public thumbnails for pending reports, then pending cleanup "after" photos,
then unpublish the thumbnails of cleanups a moderator rejected.

    python -m thumbs.main [--batch-size N]

Exit codes: 0 ok, 1 some rows failed/retried, a detector is unavailable or a source table is
missing (so the job shows up red), 4 bad configuration.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import Counter

import httpx

from .detectors import BrokenDetector, default_detectors
from .pipeline import DEFAULT_MAX_SIDE, DEFAULT_QUALITY, ThumbSettings
from .storage import THUMB_BUCKET, StorageConfig, delete_object, download, upload_jpeg
from .worker import (
    SOURCES,
    Outcome,
    Source,
    handle_photo,
    purge_rejected_cleanups,
    run_batch,
)

log = logging.getLogger("thumbs")

DEFAULT_YUNET = "/models/face_detection_yunet_2023mar.onnx"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m thumbs.main")
    p.add_argument(
        "--batch-size",
        type=int,
        default=int(os.environ.get("BATCH_SIZE", "50")),
        help="maximum rows per source per run",
    )
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
        settings = ThumbSettings(
            max_side=int(os.environ.get("THUMB_MAX_SIDE", DEFAULT_MAX_SIDE)),
            quality=int(os.environ.get("THUMB_QUALITY", DEFAULT_QUALITY)),
        )
    except (RuntimeError, ValueError) as exc:
        log.error("%s", exc)
        return 4

    detectors = default_detectors(
        os.environ.get("YUNET_MODEL_PATH", DEFAULT_YUNET),
        face_score=float(os.environ.get("FACE_SCORE_THRESHOLD", "0.6")),
    )
    broken = [d for d in detectors if isinstance(d, BrokenDetector)]
    for d in broken:
        log.error("%s detector unavailable (%s); photos will be marked failed", d.name, d.error)

    import psycopg

    total: Counter[str] = Counter()
    # autocommit: each transaction() block in run_batch must really commit (poison-pill guard).
    with httpx.Client(timeout=60) as client, psycopg.connect(dsn, autocommit=True) as conn:

        def make_handler(src: Source):
            def handler(row_id: str, photo_path: str | None) -> Outcome:
                return handle_photo(
                    src.key(row_id),
                    photo_path,
                    fetch=lambda path: download(client, storage, src.bucket, path),
                    upload=lambda key, data: upload_jpeg(client, storage, THUMB_BUCKET, key, data),
                    detectors=detectors,
                    settings=settings,
                    allowed=src.path_re,
                )

            return handler

        for src in SOURCES:
            try:
                counts = run_batch(conn, args.batch_size, make_handler(src), source=src)
            except psycopg.errors.UndefinedTable as exc:  # migration not applied yet
                log.error("%s: %s", src.name, exc)
                total["missing_table"] += 1
                continue
            log.info("%s: %s", src.name, dict(counts))
            total.update(counts)
        # After the cleanups pass, so a cleanup rejected while its thumbnail was being built
        # is unpublished in the same run.
        try:
            counts = purge_rejected_cleanups(
                conn,
                lambda key: delete_object(client, storage, THUMB_BUCKET, key),
                limit=args.batch_size,
            )
        except psycopg.errors.UndefinedTable as exc:
            log.error("rejected cleanups: %s", exc)
            total["missing_table"] += 1
        else:
            log.info("rejected cleanups: %s", dict(counts))
            total.update(counts)
    log.info("done: %s", dict(total))
    return 1 if broken or total["failed"] or total["retry"] or total["missing_table"] else 0


if __name__ == "__main__":
    sys.exit(main())
