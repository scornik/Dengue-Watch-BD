"""Per-photo handling (no DB) and the claim/process/update loop (DB), generic over sources.

A `Source` describes one table whose rows carry a private photo that needs a public,
privacy-safe thumbnail: reports (citizen photos) and cleanups (volunteer "after" photos).
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import httpx
import psycopg

from .detectors import Detector
from .pipeline import ThumbSettings, make_thumbnail
from .storage import CLEANUP_BUCKET, SOURCE_BUCKET, ObjectNotFound

log = logging.getLogger("thumbs")

Status = Literal["ok", "failed", "retry"]


@dataclass(frozen=True, slots=True)
class Source:
    """One kind of photo row. SQL fragments are trusted constants, never user input."""

    name: str
    table: str
    bucket: str  # private bucket holding the originals
    path_column: str
    where: str  # extra claim filter (besides thumb_status = 'pending')
    order_by: str
    key_prefix: str = ""  # thumbnail key in the public bucket: {key_prefix}{id}.jpg
    id_column: str = "id"

    def key(self, row_id: str) -> str:
        return f"{self.key_prefix}{row_id}.jpg"

    @property
    def claim_sql(self) -> str:
        # One row per transaction: the row lock is held only while that photo is processed,
        # and FOR UPDATE SKIP LOCKED lets overlapping runs work on different rows.
        return f"""
SELECT {self.id_column}::text, {self.path_column}
  FROM {self.table}
 WHERE thumb_status = 'pending'
   AND ({self.where})
   AND NOT ({self.id_column} = ANY(%(skip)s::uuid[]))
 ORDER BY {self.order_by}
 LIMIT 1
   FOR UPDATE SKIP LOCKED
"""

    @property
    def mark_ok_sql(self) -> str:
        return (
            f"UPDATE {self.table} SET thumb_public_path = %(key)s, thumb_status = 'ok' "
            f"WHERE {self.id_column} = %(id)s::uuid"
        )

    @property
    def mark_failed_sql(self) -> str:
        return (
            f"UPDATE {self.table} SET thumb_public_path = NULL, thumb_status = 'failed' "
            f"WHERE {self.id_column} = %(id)s::uuid"
        )


REPORTS = Source(
    name="reports",
    table="reports",
    bucket=SOURCE_BUCKET,
    path_column="photo_path",
    # Also skips rows whose ai_label is still NULL (not yet screened).
    where="ai_label <> 'not_relevant'",
    order_by="created_at, id",
)
CLEANUPS = Source(
    name="cleanups",
    table="cleanups",
    bucket=CLEANUP_BUCKET,
    path_column="after_photo_path",
    where="status = 'done' AND after_photo_path IS NOT NULL",
    order_by="done_at NULLS LAST, id",
    key_prefix="c/",
)
SOURCES: tuple[Source, ...] = (REPORTS, CLEANUPS)  # processed in this order each run


@dataclass(frozen=True, slots=True)
class Outcome:
    status: Status
    key: str | None = None
    error: str | None = None
    boxes: int = 0


def handle_photo(
    key: str,
    photo_path: str | None,
    *,
    fetch: Callable[[str], bytes],
    upload: Callable[[str, bytes], None],
    detectors: Sequence[Detector],
    settings: ThumbSettings | None = None,
) -> Outcome:
    """Build one thumbnail and upload it under `key`.

    failed: permanent problem (missing original, undecodable image, detector/blur error);
            nothing is uploaded.
    retry:  transient storage/network error; the row stays 'pending' for the next run.
    """
    if not photo_path:
        return Outcome("failed", error="row has no photo path")
    try:
        original = fetch(photo_path)
    except ObjectNotFound:
        return Outcome("failed", error="original photo not found")
    except httpx.HTTPError as exc:
        return Outcome("retry", error=f"download: {exc}")
    try:
        thumb = make_thumbnail(original, detectors, settings)
    except Exception as exc:  # fail closed: never publish an unchecked image
        return Outcome("failed", error=f"{type(exc).__name__}: {exc}")
    try:
        upload(key, thumb.jpeg)
    except httpx.HTTPError as exc:
        return Outcome("retry", error=f"upload: {exc}")
    return Outcome("ok", key=key, boxes=len(thumb.boxes))


def handle_report(report_id: str, photo_path: str | None, **kwargs) -> Outcome:
    """Report thumbnail at `{report_id}.jpg` (see handle_photo)."""
    return handle_photo(REPORTS.key(report_id), photo_path, **kwargs)


def run_batch(
    conn: psycopg.Connection,
    batch_size: int,
    handler: Callable[[str, str | None], Outcome],
    max_consecutive_retries: int = 3,
    source: Source = REPORTS,
) -> Counter[str]:
    counts: Counter[str] = Counter()
    skip: list[str] = []  # rows left pending this run (transient errors)
    streak = 0
    for _ in range(batch_size):
        with conn.transaction():
            row = conn.execute(source.claim_sql, {"skip": skip}).fetchone()
            if row is None:
                break
            row_id, photo_path = row
            outcome = handler(row_id, photo_path)
            counts[outcome.status] += 1
            if outcome.status == "ok":
                conn.execute(source.mark_ok_sql, {"key": outcome.key, "id": row_id})
                log.info("ok %s %s (%d boxes blurred)", source.name, row_id, outcome.boxes)
            elif outcome.status == "failed":
                conn.execute(source.mark_failed_sql, {"id": row_id})
                log.warning("failed %s %s: %s", source.name, row_id, outcome.error)
            else:
                skip.append(row_id)
                log.warning("retry later %s %s: %s", source.name, row_id, outcome.error)
        streak = streak + 1 if outcome.status == "retry" else 0
        if streak >= max_consecutive_retries:
            log.error("storage looks unavailable; stopping %s for this run", source.name)
            break
    return counts
