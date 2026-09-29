import io

import pytest
from PIL import Image


@pytest.fixture
def jpeg_bytes():
    def make(size=(64, 48), color=(200, 30, 30), exif_orientation: int | None = None) -> bytes:
        im = Image.new("RGB", size, color)
        buf = io.BytesIO()
        if exif_orientation is not None:
            exif = Image.Exif()
            exif[0x0112] = exif_orientation  # Orientation
            exif[0x010F] = "PhoneMaker"  # Make
            im.save(buf, "JPEG", exif=exif)
        else:
            im.save(buf, "JPEG")
        return buf.getvalue()

    return make
