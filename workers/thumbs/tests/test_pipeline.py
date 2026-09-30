import io

import numpy as np
import pytest
from PIL import Image, JpegImagePlugin

from thumbs.pipeline import (
    DEFAULT_MAX_SIDE,
    DEFAULT_QUALITY,
    ThumbnailError,
    ThumbSettings,
    blur_region,
    decode,
    encode_jpeg,
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
    [((800, 600), (320, 240)), ((600, 1200), (160, 320)), ((300, 200), (300, 200))],
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
    assert thumb.size == (240, 320)


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


def test_compression_defaults():
    assert (DEFAULT_MAX_SIDE, DEFAULT_QUALITY) == (320, 50)
    assert ThumbSettings() == ThumbSettings(max_side=320, quality=50)


def _smooth_photo(size=(1600, 1200)) -> bytes:
    """Photo-like image (gradients + shapes) so JPEG sizes resemble real photos."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    arr = np.stack(
        [
            127 + 100 * np.sin(xx / 97.0) * np.cos(yy / 53.0),
            127 + 100 * np.cos((xx + yy) / 71.0),
            (xx / w) * 255,
        ],
        axis=-1,
    )
    arr += np.random.default_rng(3).normal(0, 6, arr.shape)  # sensor noise
    buf = io.BytesIO()
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(buf, "JPEG", quality=92)
    return buf.getvalue()


def test_default_output_is_small_progressive_420_jpeg_without_exif(noisy_jpeg):
    thumb = make_thumbnail(noisy_jpeg(size=(1600, 1200)), [StubDetector([])])
    out = _open(thumb.jpeg)
    assert out.format == "JPEG" and max(out.size) <= 320 and out.size == (320, 240)
    assert out.info.get("progressive") or out.info.get("progression")
    assert JpegImagePlugin.get_sampling(out) == 2  # 4:2:0
    assert len(out.getexif()) == 0 and "exif" not in out.info


def test_new_defaults_are_smaller_than_old_ones():
    src = _smooth_photo()
    new = make_thumbnail(src, [StubDetector([])])
    old_settings = make_thumbnail(src, [StubDetector([])], ThumbSettings(max_side=480, quality=75))
    assert len(new.jpeg) < len(old_settings.jpeg) * 0.6
    # Same pixels, old encoder (baseline, optimize only) vs new (progressive, 4:2:0) at q50.
    pixels = _open(new.jpeg).convert("RGB")
    baseline = io.BytesIO()
    pixels.save(baseline, "JPEG", quality=50, optimize=True, subsampling="4:4:4")
    assert len(encode_jpeg(np.asarray(pixels), 50, 1 << 20)) < baseline.tell()


def test_env_style_overrides_still_apply(noisy_jpeg):
    thumb = make_thumbnail(noisy_jpeg(), [StubDetector([])], ThumbSettings(max_side=480))
    assert thumb.size == (480, 360)
    with pytest.raises(ValueError):
        ThumbSettings(quality=0)
    with pytest.raises(ValueError):
        ThumbSettings(max_side=8)


def test_low_quality_setting_still_encodes(noisy_jpeg):
    thumb = make_thumbnail(noisy_jpeg(), [StubDetector([])], ThumbSettings(quality=20))
    assert _open(thumb.jpeg).format == "JPEG"
