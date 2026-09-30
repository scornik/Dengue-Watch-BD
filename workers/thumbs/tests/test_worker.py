import io

import httpx
from PIL import Image

from thumbs.storage import ObjectNotFound
from thumbs.worker import CLEANUPS, REPORTS, SOURCES, handle_photo, handle_report


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


# --- sources: reports and volunteer cleanup "after" photos ---------------------------------


def test_source_keys_and_buckets():
    assert REPORTS.key("abc") == "abc.jpg"
    assert CLEANUPS.key("abc") == "c/abc.jpg"
    assert (REPORTS.bucket, CLEANUPS.bucket) == ("report-photos", "cleanup-photos")
    assert [s.name for s in SOURCES] == ["reports", "cleanups"]  # reports first


def test_cleanup_claim_sql_filters():
    sql = CLEANUPS.claim_sql
    assert "FROM cleanups" in sql and "after_photo_path" in sql
    assert "status = 'done'" in sql and "after_photo_path IS NOT NULL" in sql
    assert "thumb_status = 'pending'" in sql and "FOR UPDATE SKIP LOCKED" in sql
    assert "UPDATE cleanups" in CLEANUPS.mark_ok_sql
    assert "thumb_status = 'failed'" in CLEANUPS.mark_failed_sql


def run_cleanup(fetch, detectors, upload_error=None):
    uploads = []

    def upload(key, data):
        if upload_error:
            raise upload_error
        uploads.append((key, data))

    out = handle_photo(
        CLEANUPS.key("cid-1"), "v/1.jpg", fetch=fetch, upload=upload, detectors=detectors
    )
    return out, uploads


def test_cleanup_ok_uploads_under_c_prefix(noisy_jpeg):
    fetched = []
    out, uploads = run_cleanup(lambda p: fetched.append(p) or noisy_jpeg(), [Stub()])
    assert fetched == ["v/1.jpg"]
    assert out.status == "ok" and out.key == "c/cid-1.jpg" and out.boxes == 1
    assert [k for k, _ in uploads] == ["c/cid-1.jpg"]
    im = Image.open(io.BytesIO(uploads[0][1]))
    assert im.format == "JPEG" and max(im.size) <= 320 and len(im.getexif()) == 0


def test_cleanup_fails_closed(noisy_jpeg):
    out, uploads = run_cleanup(lambda p: noisy_jpeg(), [Stub(), Boom()])
    assert out.status == "failed" and uploads == []
    out, uploads = run_cleanup(lambda p: b"garbage", [Stub()])
    assert out.status == "failed" and uploads == []
    out = handle_photo("c/x.jpg", None, fetch=lambda p: b"", upload=lambda k, d: None, detectors=[])
    assert out.status == "failed"


def test_cleanup_transient_errors_retry(noisy_jpeg):
    def down(p):
        raise httpx.ConnectError("boom")

    assert run_cleanup(down, [Stub()])[0].status == "retry"
    err = httpx.HTTPStatusError(
        "503", request=httpx.Request("GET", "x"), response=httpx.Response(503)
    )
    out, uploads = run_cleanup(lambda p: noisy_jpeg(), [Stub()], upload_error=err)
    assert out.status == "retry" and uploads == []
