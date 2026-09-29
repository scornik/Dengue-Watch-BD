import numpy as np
import pytest

from thumbs.detectors import (
    BrokenDetector,
    HaarPlateDetector,
    YuNetFaceDetector,
    _scaled,
    _unscale,
    default_detectors,
)


def test_yunet_missing_model_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        YuNetFaceDetector(tmp_path / "nope.onnx")


def test_default_detectors_fail_closed_without_model(tmp_path):
    dets = default_detectors(tmp_path / "missing.onnx")
    broken = [d for d in dets if isinstance(d, BrokenDetector)]
    assert [d.name for d in broken] == ["faces"]
    with pytest.raises(RuntimeError, match="faces detector unavailable"):
        broken[0].detect(np.zeros((10, 10, 3), np.uint8))


def test_bundled_plate_cascade_runs():
    det = HaarPlateDetector()
    assert det.detect(np.full((400, 600, 3), 127, np.uint8)) == []


def test_scale_helpers():
    img = np.zeros((1000, 3000, 3), np.uint8)
    small, s = _scaled(img, 1500)
    assert small.shape[:2] == (500, 1500) and s == 0.5
    same, s1 = _scaled(img, None)
    assert same is img and s1 == 1.0
    assert _unscale(10, 20, 30, 40, 0.5) == (20, 40, 60, 80)
