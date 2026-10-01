import io

import httpx
import pytest
from PIL import Image

from thumbs.storage import ObjectNotFound
from thumbs.worker import (
    CLEANUPS,
    CLEAR_THUMB_SQL,
    REPORTS,
    SOURCES,
    Outcome,
    handle_photo,
    handle_report,
    purge_rejected_cleanups,
    run_batch,
)

UID = "0f8fad5b-d9cb-469f-a165-70867728950e"
REPORT_PATH = f"2026/09/{UID}.jpg"  # submit-report layout: YYYY/MM/<report id>.jpg
CLEANUP_PATH = f"{UID}/{UID}.jpg"  # client layout: <volunteer id>/<cleanup id>.jpg


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

    out = handle_report("rid-1", REPORT_PATH, fetch=fetch, upload=upload, detectors=detectors)
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
        CLEANUPS.key("cid-1"),
        CLEANUP_PATH,
        fetch=fetch,
        upload=upload,
        detectors=detectors,
        allowed=CLEANUPS.path_re,
    )
    return out, uploads


def test_cleanup_ok_uploads_under_c_prefix(noisy_jpeg):
    fetched = []
    out, uploads = run_cleanup(lambda p: fetched.append(p) or noisy_jpeg(), [Stub()])
    assert fetched == [CLEANUP_PATH]
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


# --- storage key validation: malformed paths never reach a storage URL ----------------------


@pytest.mark.parametrize(
    "path",
    [
        "../secret.jpg",
        f"2026/09/../{UID}.jpg",
        f"2026\\09\\{UID}.jpg",
        f"2026/09/{UID}%2e.jpg",
        f"2026/09/{UID}.jpg\n",
        f"2026/09/{UID}\x00.jpg",
        f"/2026/09/{UID}.jpg",
        "u/1.jpg",  # not the submit-report layout
        f"2026/09/{UID}.png",
    ],
)
def test_report_bad_paths_fail_without_fetch(noisy_jpeg, path):
    fetched = []
    out = handle_report(
        "r", path, fetch=lambda p: fetched.append(p) or noisy_jpeg(),
        upload=lambda k, d: None, detectors=[Stub()],
    )  # fmt: skip
    assert out.status == "failed" and fetched == []


@pytest.mark.parametrize(
    "path",
    [
        f"{UID}/..",
        f"{UID}/../x.jpg",
        "short/x.jpg",
        f"{UID}/a%2Fb.jpg",
        f"{UID}/a\\b.jpg",
        f"{UID}/a\tb.jpg",
        f"{UID}/sub/x.jpg",
    ],
)
def test_cleanup_bad_paths_fail_without_fetch(noisy_jpeg, path):
    fetched = []
    out = handle_photo(
        CLEANUPS.key("c1"), path, fetch=lambda p: fetched.append(p) or noisy_jpeg(),
        upload=lambda k, d: None, detectors=[Stub()], allowed=CLEANUPS.path_re,
    )  # fmt: skip
    assert out.status == "failed" and fetched == []


def test_oversized_image_marks_failed(noisy_jpeg):
    jpeg = noisy_jpeg(size=(64, 64))
    i = jpeg.index(b"\xff\xc0")  # SOF0: claim 20000 x 20000 pixels
    bomb = jpeg[: i + 5] + (20000).to_bytes(2, "big") * 2 + jpeg[i + 9 :]
    out, uploads = run(lambda p: bomb, [Stub()])
    assert out.status == "failed" and "too large" in out.error and uploads == []


# --- run_batch / purge against a scripted fake connection ----------------------------------


ID1 = {"id": "r1"}


class FakeConn:
    """Records statements per transaction; `rows` feeds successive claim/select results."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.committed: list[list[tuple]] = []
        self._tx: list[tuple] | None = None

    def transaction(self):
        conn = self

        class Tx:
            def __enter__(self):
                conn._tx = []

            def __exit__(self, exc_type, *a):
                if exc_type is None:
                    conn.committed.append(conn._tx)
                conn._tx = None

        return Tx()

    def execute(self, sql, params=None):
        assert self._tx is not None, "statement outside a transaction block"
        self._tx.append((sql, params))
        res = self.rows.pop(0) if sql.lstrip().startswith("SELECT") else None

        class Cur:
            def fetchone(self):
                return res

            def fetchall(self):
                return res or []

        return Cur()


def test_row_is_marked_failed_and_committed_before_processing():
    conn = FakeConn([("r1", REPORT_PATH), None])
    seen = []

    def handler(rid, path):
        seen.append(list(conn.committed))  # what is durable while the photo is processed
        return Outcome("ok", key="r1.jpg")

    counts = run_batch(conn, 5, handler)
    assert counts == {"ok": 1}
    assert seen == [[[(REPORTS.claim_sql, {"skip": []}), (REPORTS.mark_failed_sql, ID1)]]]
    assert "thumb_status = 'failed'" in REPORTS.mark_failed_sql
    assert conn.committed[1] == [(REPORTS.mark_ok_sql, {"key": "r1.jpg", **ID1})]


def test_crash_while_processing_leaves_row_failed():
    conn = FakeConn([("r1", REPORT_PATH)])

    def handler(rid, path):
        raise MemoryError("decoder blew up")

    with pytest.raises(MemoryError):
        run_batch(conn, 5, handler)
    # Only the claim transaction (with the 'failed' mark) committed; nothing marks it ok.
    assert conn.committed == [[(REPORTS.claim_sql, {"skip": []}), (REPORTS.mark_failed_sql, ID1)]]


def test_retry_puts_row_back_to_pending():
    conn = FakeConn([("r1", REPORT_PATH), None])
    counts = run_batch(conn, 5, lambda r, p: Outcome("retry", error="503"))
    assert counts == {"retry": 1}
    assert conn.committed[1] == [(REPORTS.mark_pending_sql, ID1)]
    assert "thumb_status = 'pending'" in REPORTS.mark_pending_sql


def test_purge_rejected_cleanups_deletes_thumb_and_clears_path():
    conn = FakeConn([[("c1",), ("c2",)]])
    deleted = []
    counts = purge_rejected_cleanups(conn, deleted.append)
    assert deleted == ["c/c1.jpg", "c/c2.jpg"]
    assert counts == {"unpublished": 2}
    assert conn.committed[0][1:] == [
        (CLEAR_THUMB_SQL, {"id": "c1"}),
        (CLEAR_THUMB_SQL, {"id": "c2"}),
    ]


def test_purge_keeps_row_when_storage_fails_and_is_idempotent():
    def delete(key):
        if key == "c/c1.jpg":
            raise httpx.ConnectError("down")

    conn = FakeConn([[("c1",), ("c2",)]])
    assert purge_rejected_cleanups(conn, delete) == {"retry": 1, "unpublished": 1}
    assert conn.committed[0][1:] == [
        (CLEAR_THUMB_SQL, {"id": "c2"})
    ]  # c1 keeps its path for the next run
    conn = FakeConn([[]])
    assert purge_rejected_cleanups(conn, delete) == {}
