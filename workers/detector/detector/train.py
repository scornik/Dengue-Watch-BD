"""Train a YOLO classification model on the exported dataset.

    python -m detector.train [--data data/dataset] [--model yolo11n-cls.pt] [--epochs 50]

Requires `uv pip install -r requirements-train.txt` (Ultralytics, AGPL-3.0; pulls in torch).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from .labels import CLASSES

log = logging.getLogger("detector.train")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def check_dataset(root: Path, min_per_class: int = 1) -> dict[str, dict[str, int]]:
    """Count images per split/class and fail early on layouts Ultralytics would reject."""
    counts: dict[str, dict[str, int]] = {}
    for split in ("train", "val"):
        d = root / split
        if not d.is_dir():
            raise ValueError(f"missing {d}")
        counts[split] = {
            c.name: sum(1 for f in c.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
            for c in sorted(d.iterdir())
            if c.is_dir()
        }
        unknown = set(counts[split]) - set(CLASSES)
        if unknown:
            raise ValueError(f"unknown class folders in {d}: {sorted(unknown)}")
    train_classes = {c for c, n in counts["train"].items() if n >= min_per_class}
    if len(train_classes) < 2:
        raise ValueError("need at least 2 classes with images in train/")
    missing_val = train_classes - {c for c, n in counts["val"].items() if n > 0}
    if missing_val:
        log.warning("classes without validation images: %s", sorted(missing_val))
    return counts


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m detector.train")
    p.add_argument("--data", type=Path, default=Path("data/dataset"))
    p.add_argument("--model", default="yolo11n-cls.pt", help="pretrained checkpoint to fine-tune")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--imgsz", type=int, default=224)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--device", default=None, help="e.g. cpu, 0")
    p.add_argument("--project", default="runs/classify")
    p.add_argument("--name", default="train")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO)

    try:
        counts = check_dataset(args.data)
    except ValueError as exc:
        log.error("dataset check failed: %s", exc)
        return 2
    log.info("dataset: %s", counts)

    try:
        from ultralytics import YOLO
    except ImportError:
        log.error("ultralytics not installed: uv pip install -r requirements-train.txt")
        return 4

    model = YOLO(args.model)
    model.train(
        data=str(args.data.resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        exist_ok=True,  # stable output path: <project>/<name>/weights/best.pt
        seed=0,
        deterministic=True,
    )
    metrics = model.val()
    log.info("val top1=%.3f top5=%.3f", metrics.top1, metrics.top5)
    best = getattr(model.trainer, "best", None)
    log.info("best weights: %s", best)
    return 0


if __name__ == "__main__":
    sys.exit(main())
