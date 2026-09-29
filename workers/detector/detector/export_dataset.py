"""Export moderator-labelled report photos into an Ultralytics classification dataset.

    python -m detector.export_dataset [--out data/dataset] [--val-pct 20] [--limit N]

Layout (what `yolo classify train data=<out>` expects):

    <out>/train/<class>/<report_id>.jpg
    <out>/val/<class>/<report_id>.jpg

Photos are re-encoded as JPEG (EXIF orientation applied, all metadata dropped) and
downscaled to at most --max-side px. Existing files are skipped, so re-runs are incremental.
The split is a hash of the report id, so a photo never moves between train and val.
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import sys
from collections import Counter
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

import httpx
from PIL import Image, ImageOps

from .labels import map_label, split_for
from .storage import StorageConfig, download

log = logging.getLogger("detector.export")

BUCKET = "report-photos"

# Column names follow the Supabase migrations; adjust here if the schema changes.
EXPORT_SQL = """
SELECT r.id::text, r.photo_path, r.site_type::text, l.moderator_label::text
  FROM reports r
  JOIN ai_labels l ON l.report_id = r.id
 WHERE l.moderator_label IS NOT NULL
   AND r.photo_path IS NOT NULL
"""


@dataclass(frozen=True, slots=True)
class LabelledReport:
    report_id: str
    photo_path: str
    site_type: str | None
    moderator_label: str | None


@dataclass(frozen=True, slots=True)
class Example:
    report_id: str
    photo_path: str
    cls: str
    split: str


def plan_examples(rows: Iterable[LabelledReport], val_pct: int) -> list[Example]:
    """Map rows to (class, split). Reports with conflicting labels are dropped."""
    by_report: dict[str, set[str | None]] = {}
    first: dict[str, LabelledReport] = {}
    for r in rows:
        by_report.setdefault(r.report_id, set()).add(map_label(r.moderator_label, r.site_type))
        first.setdefault(r.report_id, r)
    out: list[Example] = []
    for rid, classes in sorted(by_report.items()):
        if len(classes) != 1:
            log.info("skipping %s: conflicting labels %s", rid, classes)
            continue
        (cls,) = classes
        if cls is None:
            continue
        out.append(Example(rid, first[rid].photo_path, cls, split_for(rid, val_pct)))
    return out


def to_training_jpeg(data: bytes, max_side: int) -> bytes:
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=90)  # no exif= argument -> no metadata written
        return buf.getvalue()


def export(
    examples: Iterable[Example],
    out: Path,
    fetch: Callable[[str], bytes],
    max_side: int = 640,
) -> Counter[str]:
    """Write examples; returns counts per "split/class" (and "skipped"/"failed")."""
    counts: Counter[str] = Counter()
    for ex in examples:
        dest = out / ex.split / ex.cls / f"{ex.report_id}.jpg"
        if dest.exists():
            counts["skipped"] += 1
            continue
        try:
            jpeg = to_training_jpeg(fetch(ex.photo_path), max_side)
        except Exception as exc:  # one bad photo must not stop the export
            log.warning("failed %s (%s): %s", ex.report_id, ex.photo_path, exc)
            counts["failed"] += 1
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(jpeg)
        tmp.replace(dest)
        counts[f"{ex.split}/{ex.cls}"] += 1
    return counts


def fetch_rows(dsn: str, limit: int | None) -> Iterator[LabelledReport]:
    import psycopg

    sql = EXPORT_SQL + (f" LIMIT {int(limit)}" if limit else "")
    with psycopg.connect(dsn) as conn:
        for rid, path, site, label in conn.execute(sql):
            yield LabelledReport(rid, path, site, label)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m detector.export_dataset")
    p.add_argument("--out", type=Path, default=Path(os.environ.get("DATASET_DIR", "data/dataset")))
    p.add_argument("--val-pct", type=int, default=int(os.environ.get("VAL_PCT", "20")))
    p.add_argument("--max-side", type=int, default=640)
    p.add_argument("--limit", type=int)
    args = p.parse_args(argv)
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is not set")
        return 4
    storage = StorageConfig.from_env()
    examples = plan_examples(fetch_rows(dsn, args.limit), args.val_pct)
    log.info("%d labelled examples to export", len(examples))
    with httpx.Client(timeout=60) as client:
        counts = export(
            examples, args.out, lambda path: download(client, storage, BUCKET, path),
            args.max_side,
        )  # fmt: skip
    for key, n in sorted(counts.items()):
        log.info("%-28s %d", key, n)
    return 0 if examples else 2


if __name__ == "__main__":
    sys.exit(main())
