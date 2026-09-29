import io

import numpy as np
import pytest
from PIL import Image


@pytest.fixture
def noisy_jpeg():
    """Random-noise photo (high local variance) with EXIF, optionally rotated via Orientation."""

    def make(size=(800, 600), orientation: int | None = None, seed: int = 0) -> bytes:
        rng = np.random.default_rng(seed)
        arr = rng.integers(0, 256, size=(size[1], size[0], 3), dtype=np.uint8)
        im = Image.fromarray(arr, "RGB")
        exif = Image.Exif()
        exif[0x010F] = "PhoneMaker"  # Make
        exif[0x0110] = "Model X"  # Model
        gps = exif.get_ifd(0x8825)  # GPS IFD: reporter location must never leak
        gps[1], gps[2] = "N", (23.0, 48.0, 36.0)
        gps[3], gps[4] = "E", (90.0, 24.0, 45.0)
        if orientation is not None:
            exif[0x0112] = orientation
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=95, exif=exif)
        return buf.getvalue()

    return make
