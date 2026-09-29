"""Privacy detectors. Each returns boxes (x, y, w, h) in the pixel space of the image it gets.

Detectors are deliberately *conservative*: they run on the full-resolution image (capped for
memory) and on a downscaled copy, and use low score thresholds. Over-blurring a flower tub is
fine; publishing a face or a number plate is not. Any exception propagates, and the pipeline
then refuses to publish.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

Box = tuple[int, int, int, int]  # x, y, w, h

YUNET_FILENAME = "face_detection_yunet_2023mar.onnx"
PLATE_CASCADE = "haarcascade_russian_plate_number.xml"


class Detector(Protocol):
    name: str

    def detect(self, bgr: np.ndarray) -> list[Box]: ...


def _scaled(bgr: np.ndarray, max_side: int | None) -> tuple[np.ndarray, float]:
    h, w = bgr.shape[:2]
    if max_side is None or max(h, w) <= max_side:
        return bgr, 1.0
    s = max_side / max(h, w)
    return cv2.resize(bgr, (max(1, round(w * s)), max(1, round(h * s))), cv2.INTER_AREA), s


def _unscale(x: float, y: float, w: float, h: float, s: float) -> Box:
    return (int(x / s), int(y / s), int(np.ceil(w / s)), int(np.ceil(h / s)))


class YuNetFaceDetector:
    """OpenCV YuNet (opencv_zoo, Apache-2.0) run at several scales for small and large faces."""

    name = "faces"

    def __init__(
        self,
        model_path: str | Path,
        score_threshold: float = 0.6,
        scales: Sequence[int | None] = (1600, 640),
    ) -> None:
        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(f"YuNet model not found at {path}")
        self._net = cv2.FaceDetectorYN.create(str(path), "", (320, 320), score_threshold, 0.3, 5000)
        self._scales = tuple(scales)

    def detect(self, bgr: np.ndarray) -> list[Box]:
        boxes: list[Box] = []
        seen: set[float] = set()
        for max_side in self._scales:
            img, s = _scaled(bgr, max_side)
            if s in seen:
                continue
            seen.add(s)
            self._net.setInputSize((img.shape[1], img.shape[0]))
            _, faces = self._net.detect(img)
            if faces is None:
                continue
            for f in faces:
                boxes.append(_unscale(f[0], f[1], f[2], f[3], s))
        return boxes


class HaarPlateDetector:
    """Baseline number-plate detector: OpenCV's bundled Russian-plate Haar cascade.

    Bangladeshi plates (Bangla script, white/green) differ from the training data, so this is a
    weak baseline; low minNeighbors and multi-scale runs trade false positives for recall.
    """

    name = "plates"

    def __init__(
        self,
        cascade_path: str | Path | None = None,
        scales: Sequence[int | None] = (3000, 1280),
        min_neighbors: int = 3,
    ) -> None:
        path = str(cascade_path or Path(cv2.data.haarcascades) / PLATE_CASCADE)
        self._cascade = cv2.CascadeClassifier(path)
        if self._cascade.empty():
            raise RuntimeError(f"could not load plate cascade {path}")
        self._scales = tuple(scales)
        self._min_neighbors = min_neighbors

    def detect(self, bgr: np.ndarray) -> list[Box]:
        boxes: list[Box] = []
        seen: set[float] = set()
        for max_side in self._scales:
            img, s = _scaled(bgr, max_side)
            if s in seen:
                continue
            seen.add(s)
            gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
            found = self._cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=self._min_neighbors, minSize=(24, 8)
            )
            for x, y, w, h in found:
                boxes.append(_unscale(x, y, w, h, s))
        return boxes


class BrokenDetector:
    """Stands in for a detector that failed to initialise, so every photo fails closed."""

    def __init__(self, name: str, error: Exception) -> None:
        self.name = name
        self.error = error

    def detect(self, bgr: np.ndarray) -> list[Box]:
        raise RuntimeError(f"{self.name} detector unavailable: {self.error}")


def default_detectors(yunet_model_path: str | Path, face_score: float = 0.6) -> list[Detector]:
    """Faces + plates; initialisation errors become BrokenDetectors (fail closed)."""
    dets: list[Detector] = []
    try:
        dets.append(YuNetFaceDetector(yunet_model_path, score_threshold=face_score))
    except Exception as exc:
        dets.append(BrokenDetector("faces", exc))
    try:
        dets.append(HaarPlateDetector())
    except Exception as exc:
        dets.append(BrokenDetector("plates", exc))
    return dets
