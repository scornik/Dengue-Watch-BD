import httpx

from thumbs.storage import ObjectNotFound
from thumbs.worker import handle_report


class Stub:
    name = "stub"

    def detect(self, bgr):
        return [(0, 0, 10, 10)]


class Boom:
    name = "boom"

    def detect(self, bgr):
        raise RuntimeError("model file missing")


def run(fetch, detectors, upload_error=None):
    uploads = []

    def upload(key, data):
        if upload_error:
            raise upload_error
        uploads.append((key, data))

    out = handle_report("rid-1", "u/1.jpg", fetch=fetch, upload=upload, detectors=detectors)
    return out, uploads


def test_ok_uploads_under_report_id(noisy_jpeg):
    out, uploads = run(lambda p: noisy_jpeg(), [Stub()])
    assert out.status == "ok" and out.key == "rid-1.jpg" and out.boxes == 1
    assert [k for k, _ in uploads] == ["rid-1.jpg"]
    assert uploads[0][1][:2] == b"\xff\xd8"  # JPEG


def test_detector_failure_marks_failed_and_uploads_nothing(noisy_jpeg):
    out, uploads = run(lambda p: noisy_jpeg(), [Stub(), Boom()])
    assert out.status == "failed" and "model file missing" in out.error
    assert uploads == []


def test_corrupt_image_marks_failed():
    out, uploads = run(lambda p: b"garbage", [Stub()])
    assert out.status == "failed" and uploads == []


def test_missing_original_marks_failed():
    def fetch(p):
        raise ObjectNotFound(p)

    out, uploads = run(fetch, [Stub()])
    assert out.status == "failed" and uploads == []


def test_missing_photo_path_marks_failed():
    out = handle_report("r", None, fetch=lambda p: b"", upload=lambda k, d: None, detectors=[])
    assert out.status == "failed"


def test_transient_errors_retry(noisy_jpeg):
    def down(p):
        raise httpx.ConnectError("boom")

    assert run(down, [Stub()])[0].status == "retry"
    out, uploads = run(lambda p: noisy_jpeg(), [Stub()], upload_error=httpx.ReadTimeout("slow"))
    assert out.status == "retry" and uploads == []
