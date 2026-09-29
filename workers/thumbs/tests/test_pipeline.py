import io

import numpy as np
import pytest
from PIL import Image

from thumbs.pipeline import (
    ThumbnailError,
    ThumbSettings,
    blur_region,
    decode,
    make_thumbnail,
    pad_box,
)


class StubDetector:
    name = "stub"

    def __init__(self, boxes):
        self.boxes = boxes
        self.shapes = []

    def detect(self, bgr):
        self.shapes.append(bgr.shape)
        return list(self.boxes)


class ExplodingDetector:
    name = "boom"

    def detect(self, bgr):
        raise RuntimeError("onnx runtime error")


def _open(jpeg: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(jpeg))
    im.load()
    return im


def test_blur_region_reduces_variance_only_inside():
    rng = np.random.default_rng(1)
    img = rng.integers(0, 256, size=(200, 200, 3), dtype=np.uint8)
    before = img.copy()
    blur_region(img, (50, 50, 80, 80))
    inside_before = before[50:130, 50:130].astype(float).var()
    inside_after = img[50:130, 50:130].astype(float).var()
    assert inside_after < inside_before * 0.1
    assert np.array_equal(img[:50], before[:50])  # outside untouched


def test_detected_box_is_blurred_in_thumbnail(noisy_jpeg):
    det = StubDetector([(100, 100, 200, 150)])  # in full-res (800x600) coordinates
    thumb = make_thumbnail(noisy_jpeg(), [det], ThumbSettings(max_side=400))
    arr = np.asarray(_open(thumb.jpeg), dtype=float)
    assert thumb.size == (400, 300)
    # Box (100..300, 100..250) at full res -> (50..150, 50..125) in the 400 px thumbnail.
    inside = arr[55:120, 55:145].var()
    outside = arr[200:290, 250:390].var()
    assert inside < outside * 0.2
    assert det.shapes == [(600, 800, 3)]  # detectors see the full-resolution image


def test_padding_extends_blur_beyond_box():
    assert pad_box((100, 100, 40, 20), (600, 800, 3), 0.25) == (90, 95, 60, 30)
    assert pad_box((0, 0, 10, 10), (50, 50, 3), 0.25) == (0, 0, 14, 14)
    assert pad_box((10, 10, 0, 5), (50, 50, 3), 0.25) is None


def test_output_has_no_exif_or_metadata(noisy_jpeg):
    src = noisy_jpeg()
    assert _open(src).getexif().get_ifd(0x8825)  # fixture really carries GPS EXIF
    out = _open(make_thumbnail(src, [StubDetector([])]).jpeg)
    assert len(out.getexif()) == 0
    assert "exif" not in out.info and "icc_profile" not in out.info
    assert out.format == "JPEG"


@pytest.mark.parametrize(
    ("size", "expected"),
    [((800, 600), (480, 360)), ((600, 1200), (240, 480)), ((300, 200), (300, 200))],
)
def test_resize_bounds_and_no_upscaling(noisy_jpeg, size, expected):
    thumb = make_thumbnail(noisy_jpeg(size=size), [StubDetector([])])
    assert thumb.size == expected
    assert _open(thumb.jpeg).size == expected
    assert len(thumb.jpeg) <= 1024 * 1024


def test_exif_orientation_applied_before_detection(noisy_jpeg):
    det = StubDetector([])
    thumb = make_thumbnail(noisy_jpeg(size=(800, 600), orientation=6), [det])
    assert det.shapes == [(800, 600, 3)]  # rotated upright: portrait
    assert thumb.size == (360, 480)


def test_detector_failure_raises(noisy_jpeg):
    with pytest.raises(RuntimeError):
        make_thumbnail(noisy_jpeg(), [StubDetector([]), ExplodingDetector()])


def test_no_detectors_is_an_error(noisy_jpeg):
    with pytest.raises(ThumbnailError):
        make_thumbnail(noisy_jpeg(), [])


def test_size_limit_enforced(noisy_jpeg):
    with pytest.raises(ThumbnailError):
        make_thumbnail(noisy_jpeg(), [StubDetector([])], ThumbSettings(max_bytes=500))


def test_decode_rejects_garbage():
    with pytest.raises(Exception):  # noqa: B017 - any decode error must propagate
        decode(b"definitely not an image")
