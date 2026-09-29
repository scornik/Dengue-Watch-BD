import httpx
import pytest

from thumbs.storage import ObjectNotFound, StorageConfig, download, upload_jpeg

CFG = StorageConfig("https://abc.supabase.co", "svc-key")


def test_download_and_not_found():
    def handler(req):
        assert req.headers["authorization"] == "Bearer svc-key"
        assert req.headers["apikey"] == "svc-key"
        if req.url.path.endswith("missing.jpg"):
            return httpx.Response(400, json={"statusCode": "404", "error": "not_found"})
        if req.url.path.endswith("gone.jpg"):
            return httpx.Response(404)
        if req.url.path.endswith("err.jpg"):
            return httpx.Response(500)
        return httpx.Response(200, content=b"img")

    c = httpx.Client(transport=httpx.MockTransport(handler))
    assert download(c, CFG, "report-photos", "u/a.jpg") == b"img"
    for name in ("missing.jpg", "gone.jpg"):
        with pytest.raises(ObjectNotFound):
            download(c, CFG, "report-photos", name)
    with pytest.raises(httpx.HTTPStatusError):
        download(c, CFG, "report-photos", "err.jpg")


def test_upload_headers():
    seen = {}

    def handler(req):
        seen.update(
            method=req.method, url=str(req.url), headers=dict(req.headers), body=req.content
        )
        return httpx.Response(200, json={"Key": "public-thumbs/r.jpg"})

    c = httpx.Client(transport=httpx.MockTransport(handler))
    upload_jpeg(c, CFG, "public-thumbs", "r.jpg", b"\xff\xd8data")
    assert seen["method"] == "POST"
    assert seen["url"] == "https://abc.supabase.co/storage/v1/object/public-thumbs/r.jpg"
    assert seen["headers"]["content-type"] == "image/jpeg"
    assert seen["headers"]["x-upsert"] == "true"
    assert seen["headers"]["authorization"] == "Bearer svc-key"
    assert seen["body"] == b"\xff\xd8data"
