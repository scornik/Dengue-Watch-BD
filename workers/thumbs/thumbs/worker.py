"""Per-report handling (no DB) and the claim/process/update loop (DB)."""

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
from .storage import ObjectNotFound

log = logging.getLogger("thumbs")

Status = Literal["ok", "failed", "retry"]


@dataclass(frozen=True, slots=True)
class Outcome:
    status: Status
    key: str | None = None
    error: str | None = None
    boxes: int = 0


def handle_report(
    report_id: str,
    photo_path: str | None,
    *,
    fetch: Callable[[str], bytes],
    upload: Callable[[str, bytes], None],
    detectors: Sequence[Detector],
    settings: ThumbSettings | None = None,
) -> Outcome:
    """Build and upload one thumbnail.

    failed: permanent problem (missing original, undecodable image, detector/blur error);
            nothing is uploaded.
    retry:  transient storage/network error; the row stays 'pending' for the next run.
    """
    if not photo_path:
        return Outcome("failed", error="report has no photo_path")
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
    key = f"{report_id}.jpg"
    try:
        upload(key, thumb.jpeg)
    except httpx.HTTPError as exc:
        return Outcome("retry", error=f"upload: {exc}")
    return Outcome("ok", key=key, boxes=len(thumb.boxes))


# One row per transaction: the row lock is held only while that photo is processed, and
# FOR UPDATE SKIP LOCKED lets overlapping runs work on different rows.
CLAIM_SQL = """
SELECT id::text, photo_path
  FROM reports
 WHERE thumb_status = 'pending'
   AND ai_label <> 'not_relevant'
   AND NOT (id = ANY(%(skip)s::uuid[]))
 ORDER BY created_at
 LIMIT 1
   FOR UPDATE SKIP LOCKED
"""
MARK_OK_SQL = """
UPDATE reports SET thumb_public_path = %(key)s, thumb_status = 'ok' WHERE id = %(id)s::uuid
"""
MARK_FAILED_SQL = """
UPDATE reports SET thumb_public_path = NULL, thumb_status = 'failed' WHERE id = %(id)s::uuid
"""


def run_batch(
    conn: psycopg.Connection,
    batch_size: int,
    handler: Callable[[str, str | None], Outcome],
    max_consecutive_retries: int = 3,
) -> Counter[str]:
    counts: Counter[str] = Counter()
    skip: list[str] = []  # rows left pending this run (transient errors)
    streak = 0
    for _ in range(batch_size):
        with conn.transaction():
            row = conn.execute(CLAIM_SQL, {"skip": skip}).fetchone()
            if row is None:
                break
            report_id, photo_path = row
            outcome = handler(report_id, photo_path)
            counts[outcome.status] += 1
            if outcome.status == "ok":
                conn.execute(MARK_OK_SQL, {"key": outcome.key, "id": report_id})
                log.info("ok %s (%d boxes blurred)", report_id, outcome.boxes)
            elif outcome.status == "failed":
                conn.execute(MARK_FAILED_SQL, {"id": report_id})
                log.warning("failed %s: %s", report_id, outcome.error)
            else:
                skip.append(report_id)
                log.warning("retry later %s: %s", report_id, outcome.error)
        streak = streak + 1 if outcome.status == "retry" else 0
        if streak >= max_consecutive_retries:
            log.error("storage looks unavailable; stopping this run")
            break
    return counts
