"""Photo -> privacy-safe public thumbnail. Pure (no network/DB); detectors are injected.

Steps: decode with Pillow -> apply EXIF orientation -> drop all metadata -> cap working size
-> run every detector on the full-resolution image -> blur each padded box (pixelate + Gaussian)
-> downscale to THUMB_MAX_SIDE -> JPEG (quality 75, no EXIF), <= 1 MB.
Any error raises; the caller must then NOT publish.
"""

from __future__ import annotations

import io
from collections.abc import Sequence
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps

from .detectors import Box, Detector

MAX_WORK_SIDE = 4096  # bounds memory/CPU for huge uploads; still far above thumbnail size


class ThumbnailError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ThumbSettings:
    max_side: int = 480
    quality: int = 75
    max_bytes: int = 1024 * 1024
    padding: float = 0.25  # fraction of box size added on every side


@dataclass(frozen=True, slots=True)
class Thumbnail:
    jpeg: bytes
    boxes: list[Box]
    size: tuple[int, int]


def decode(data: bytes) -> np.ndarray:
    """Bytes -> upright RGB array with no metadata attached."""
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        upright = ImageOps.exif_transpose(im)
        rgb = upright.convert("RGB")
    arr = np.asarray(rgb, dtype=np.uint8).copy()  # plain pixels; EXIF/ICC/XMP are gone
    h, w = arr.shape[:2]
    if max(h, w) > MAX_WORK_SIDE:
        s = MAX_WORK_SIDE / max(h, w)
        arr = cv2.resize(arr, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    return arr


def pad_box(box: Box, shape: tuple[int, ...], padding: float) -> Box | None:
    x, y, w, h = box
    if w <= 0 or h <= 0:
        return None
    px, py = max(4, int(w * padding)), max(4, int(h * padding))
    x0, y0 = max(0, x - px), max(0, y - py)
    x1, y1 = min(shape[1], x + w + px), min(shape[0], y + h + py)
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0, y0, x1 - x0, y1 - y0)


def blur_region(img: np.ndarray, box: Box) -> None:
    """Irreversibly obscure img[box] in place: coarse pixelation, then a Gaussian blur."""
    x, y, w, h = box
    roi = img[y : y + h, x : x + w]
    small = cv2.resize(roi, (max(1, w // 16), max(1, h // 16)), interpolation=cv2.INTER_AREA)
    pix = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    k = max(3, (min(w, h) // 4) | 1)
    img[y : y + h, x : x + w] = cv2.GaussianBlur(pix, (k, k), 0)


def encode_jpeg(rgb: np.ndarray, quality: int, max_bytes: int) -> bytes:
    im = Image.fromarray(rgb, "RGB")
    for q in range(quality, 29, -10):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True)  # no exif=/icc_profile= -> none written
        if buf.tell() <= max_bytes:
            return buf.getvalue()
    raise ThumbnailError("thumbnail exceeds size limit")


def make_thumbnail(
    data: bytes, detectors: Sequence[Detector], settings: ThumbSettings | None = None
) -> Thumbnail:
    s = settings or ThumbSettings()
    if not detectors:
        raise ThumbnailError("no privacy detectors configured")
    rgb = decode(data)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    boxes: list[Box] = []
    for det in detectors:
        boxes.extend(det.detect(bgr))  # exceptions propagate: never publish unchecked
    for box in boxes:
        padded = pad_box(box, rgb.shape, s.padding)
        if padded:
            blur_region(rgb, padded)
    h, w = rgb.shape[:2]
    scale = min(1.0, s.max_side / max(h, w))
    if scale < 1.0:
        rgb = cv2.resize(rgb, (max(1, round(w * scale)), max(1, round(h * scale))),
                         interpolation=cv2.INTER_AREA)  # fmt: skip
    jpeg = encode_jpeg(rgb, s.quality, s.max_bytes)
    return Thumbnail(jpeg=jpeg, boxes=boxes, size=(rgb.shape[1], rgb.shape[0]))
