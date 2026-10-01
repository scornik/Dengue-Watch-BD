"""Per-photo handling (no DB) and the claim/process/update loop (DB), generic over sources.

A `Source` describes one table whose rows carry a private photo that needs a public,
privacy-safe thumbnail: reports (citizen photos) and cleanups (volunteer "after" photos).
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import httpx
import psycopg

from .detectors import Detector
from .pipeline import ThumbSettings, make_thumbnail
from .storage import CLEANUP_BUCKET, SOURCE_BUCKET, InvalidKey, ObjectNotFound, check_key

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
    path_pattern: str  # the only original-photo keys we fetch; anything else is 'failed'
    key_prefix: str = ""  # thumbnail key in the public bucket: {key_prefix}{id}.jpg
    id_column: str = "id"

    def key(self, row_id: str) -> str:
        return f"{self.key_prefix}{row_id}.jpg"

    @property
    def path_re(self) -> re.Pattern[str]:
        return re.compile(self.path_pattern)

    @property
    def claim_sql(self) -> str:
        # One row per transaction: the row is locked only while it is claimed (see run_batch),
        # and FOR UPDATE SKIP LOCKED lets overlapping runs claim different rows.
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

    @property
    def mark_pending_sql(self) -> str:
        return (
            f"UPDATE {self.table} SET thumb_status = 'pending' "
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
    # submit-report stores originals as YYYY/MM/<report uuid>.jpg (_shared/report.ts photoPath).
    path_pattern=r"[0-9]{4}/[0-9]{2}/[0-9a-fA-F-]{36}\.jpg",
)
CLEANUPS = Source(
    name="cleanups",
    table="cleanups",
    bucket=CLEANUP_BUCKET,
    path_column="after_photo_path",
    where="status = 'done' AND after_photo_path IS NOT NULL",
    order_by="done_at NULLS LAST, id",
    # complete_cleanup only accepts <volunteer uuid>/<name> in the cleanup-photos bucket.
    path_pattern=r"[0-9a-fA-F-]{36}/[A-Za-z0-9._-]+",
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
    allowed: re.Pattern[str] | None = None,
) -> Outcome:
    """Build one thumbnail and upload it under `key`.

    failed: permanent problem (missing or malformed path, missing original, undecodable or
            oversized image, detector/blur error); nothing is uploaded.
    retry:  transient storage/network error; the row stays 'pending' for the next run.
    """
    if not photo_path:
        return Outcome("failed", error="row has no photo path")
    try:
        check_key(photo_path)  # no '..', '%', backslash or control characters
        if allowed is not None and not allowed.fullmatch(photo_path):
            raise InvalidKey(f"unexpected photo path: {photo_path!r}")
    except InvalidKey as exc:
        return Outcome("failed", error=str(exc))
    try:
        original = fetch(photo_path)
    except InvalidKey as exc:
        return Outcome("failed", error=str(exc))
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
    kwargs.setdefault("allowed", REPORTS.path_re)
    return handle_photo(REPORTS.key(report_id), photo_path, **kwargs)


def run_batch(
    conn: psycopg.Connection,
    batch_size: int,
    handler: Callable[[str, str | None], Outcome],
    max_consecutive_retries: int = 3,
    source: Source = REPORTS,
) -> Counter[str]:
    """Claim, process and update up to `batch_size` rows of `source`.

    Poison-pill guard (no schema change needed): each claimed row is set to 'failed' and
    committed BEFORE its photo is processed, then set to 'ok' (or back to 'pending' for a
    transient error) afterwards. A photo that kills the process (OOM, segfault in a codec)
    therefore stays 'failed' instead of being re-claimed first on every run, and a crash can
    never leave a row published without a finished check (fail closed). The committed
    'failed' also keeps overlapping runs off the row while it is processed, so no row lock
    is held during the slow part. `conn` must be in autocommit mode so every transaction()
    block really commits.
    """
    counts: Counter[str] = Counter()
    skip: list[str] = []  # rows left pending this run (transient errors)
    streak = 0
    for _ in range(batch_size):
        with conn.transaction():
            row = conn.execute(source.claim_sql, {"skip": skip}).fetchone()
            if row is None:
                break
            row_id, photo_path = row
            conn.execute(source.mark_failed_sql, {"id": row_id})
        outcome = handler(row_id, photo_path)
        counts[outcome.status] += 1
        with conn.transaction():
            if outcome.status == "ok":
                conn.execute(source.mark_ok_sql, {"key": outcome.key, "id": row_id})
                log.info("ok %s %s (%d boxes blurred)", source.name, row_id, outcome.boxes)
            elif outcome.status == "failed":
                conn.execute(source.mark_failed_sql, {"id": row_id})
                log.warning("failed %s %s: %s", source.name, row_id, outcome.error)
            else:
                conn.execute(source.mark_pending_sql, {"id": row_id})
                skip.append(row_id)
                log.warning("retry later %s %s: %s", source.name, row_id, outcome.error)
        streak = streak + 1 if outcome.status == "retry" else 0
        if streak >= max_consecutive_retries:
            log.error("storage looks unavailable; stopping %s for this run", source.name)
            break
    return counts


PURGE_REJECTED_SQL = """
SELECT id::text
  FROM cleanups
 WHERE status = 'rejected' AND thumb_public_path IS NOT NULL
 ORDER BY id
 LIMIT %(limit)s
   FOR UPDATE SKIP LOCKED
"""
CLEAR_THUMB_SQL = "UPDATE cleanups SET thumb_public_path = NULL WHERE id = %(id)s::uuid"


def purge_rejected_cleanups(
    conn: psycopg.Connection, delete: Callable[[str], None], limit: int = 100
) -> Counter[str]:
    """Unpublish the thumbnails of cleanups a moderator rejected.

    Deletes the object the worker uploaded (`CLEANUPS.key(id)`, never the stored column
    value) and then clears thumb_public_path, in the same transaction as the row lock.
    Idempotent: a missing object counts as deleted; a storage error leaves the row for the
    next run.
    """
    counts: Counter[str] = Counter()
    with conn.transaction():
        ids = [r[0] for r in conn.execute(PURGE_REJECTED_SQL, {"limit": limit}).fetchall()]
        for cid in ids:
            try:
                delete(CLEANUPS.key(cid))
            except httpx.HTTPError as exc:
                counts["retry"] += 1
                log.warning("retry later: unpublish rejected cleanup %s: %s", cid, exc)
                continue
            conn.execute(CLEAR_THUMB_SQL, {"id": cid})
            counts["unpublished"] += 1
            log.info("unpublished rejected cleanup %s", cid)
    return counts
