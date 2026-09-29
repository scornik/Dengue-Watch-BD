import io

import httpx
from PIL import Image

from detector.export_dataset import LabelledReport, export, plan_examples, to_training_jpeg
from detector.storage import StorageConfig, download


def test_plan_examples_filters_and_resolves_conflicts():
    rows = [
        LabelledReport("a", "a.jpg", "tire", "likely"),
        LabelledReport("b", "b.jpg", "drain", "unclear"),
        LabelledReport("c", "c.jpg", None, "not_relevant"),
        LabelledReport("d", "d.jpg", "tire", "likely"),
        LabelledReport("d", "d.jpg", "tire", "not_relevant"),  # conflicting -> dropped
        LabelledReport("e", "e.jpg", "tire", "likely"),
        LabelledReport("e", "e.jpg", "tire", "verified"),  # same class twice -> kept once
    ]
    ex = plan_examples(rows, val_pct=0)
    assert [(e.report_id, e.cls, e.split) for e in ex] == [
        ("a", "tire", "train"),
        ("c", "not_relevant", "train"),
        ("e", "tire", "train"),
    ]


def test_to_training_jpeg_strips_exif_and_applies_orientation(jpeg_bytes):
    out = to_training_jpeg(jpeg_bytes(size=(100, 40), exif_orientation=6), max_side=50)
    with Image.open(io.BytesIO(out)) as im:
        assert im.size == (20, 50)  # rotated 90 deg, then fit within 50 px
        assert len(im.getexif()) == 0


def test_export_layout_and_idempotence(tmp_path, jpeg_bytes):
    rows = [LabelledReport(f"r{i}", f"u/{i}.jpg", "drain", "likely") for i in range(6)] + [
        LabelledReport("bad", "u/bad.jpg", "tire", "likely")
    ]
    examples = plan_examples(rows, val_pct=50)
    calls = []

    def fetch(path):
        calls.append(path)
        if "bad" in path:
            return b"not an image"
        return jpeg_bytes()

    counts = export(examples, tmp_path, fetch)
    assert counts["failed"] == 1
    written = sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*.jpg"))
    assert len(written) == 6
    assert all(p.split("/")[0] in {"train", "val"} and p.split("/")[1] == "drain" for p in written)
    assert {p.split("/")[0] for p in written} == {"train", "val"}

    again = export(examples, tmp_path, fetch)
    assert again["skipped"] == 6


def test_storage_download_headers():
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        seen["auth"] = req.headers["authorization"]
        seen["apikey"] = req.headers["apikey"]
        return httpx.Response(200, content=b"img")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    cfg = StorageConfig("https://abc.supabase.co", "svc")
    assert download(client, cfg, "report-photos", "u1/photo 1.jpg") == b"img"
    assert seen["url"] == "https://abc.supabase.co/storage/v1/object/report-photos/u1/photo%201.jpg"
    assert seen["auth"] == "Bearer svc" and seen["apikey"] == "svc"
