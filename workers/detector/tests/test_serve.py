import base64

import httpx
import pytest
from fastapi.testclient import TestClient

from detector.screen import Thresholds, decide
from detector.serve import create_app

TOKEN = "s3cret"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


class StubModel:
    def __init__(self, probs):
        self.probs = probs
        self.seen = []

    def predict(self, image):
        self.seen.append(image.size)
        return self.probs


class Boom:
    def predict(self, image):
        raise RuntimeError("cuda on fire")


def client_for(model, **kw):
    return TestClient(create_app(model, TOKEN, **kw))


def test_decide_contract():
    assert decide({"drain": 0.8, "tire": 0.1, "not_relevant": 0.1}) == {
        "label": "likely", "score": 0.9, "site_type": "drain",
    }  # fmt: skip
    assert decide({"drain": 0.1, "not_relevant": 0.9}) == {
        "label": "not_relevant", "score": 0.1, "site_type": None,
    }  # fmt: skip
    got = decide({"drain": 0.35, "tire": 0.25, "not_relevant": 0.4})
    assert got["label"] == "unclear" and got["site_type"] == "drain"
    assert got["score"] == pytest.approx(0.6)
    # Model without a not_relevant class; unnormalised probabilities are normalised.
    assert decide({"tire": 2.0, "drain": 2.0}, Thresholds(likely=0.5))["label"] == "likely"


def test_requires_token():
    with pytest.raises(RuntimeError):
        create_app(StubModel({}), "")


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": f"Basic {TOKEN}"}]
)
def test_auth_rejected(headers, jpeg_bytes):
    c = client_for(StubModel({"drain": 1.0}))
    body = {"image_base64": base64.b64encode(jpeg_bytes()).decode()}
    r = c.post("/screen", json=body, headers=headers)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_screen_base64_and_data_url(jpeg_bytes):
    model = StubModel({"tire": 0.9, "not_relevant": 0.1})
    c = client_for(model)
    b64 = base64.b64encode(jpeg_bytes(size=(30, 20))).decode()
    for payload in (b64, f"data:image/jpeg;base64,{b64}"):
        r = c.post("/screen", json={"image_base64": payload}, headers=AUTH)
        assert r.status_code == 200
        assert r.json() == {"label": "likely", "score": 0.9, "site_type": "tire"}
    assert model.seen == [(30, 20), (30, 20)]


def test_screen_image_url_allowlist_and_fetch(jpeg_bytes):
    def handler(req):
        if req.url.path == "/big.jpg":
            return httpx.Response(200, content=b"x" * 2048)
        if req.url.path == "/missing.jpg":
            return httpx.Response(404)
        return httpx.Response(200, content=jpeg_bytes())

    http = httpx.Client(transport=httpx.MockTransport(handler))
    c = client_for(
        StubModel({"drain": 0.2, "not_relevant": 0.8}), http_client=http,
        allowed_hosts=["abc.supabase.co"], max_bytes=1024,
    )  # fmt: skip
    ok = c.post("/screen", json={"image_url": "https://abc.supabase.co/p.jpg"}, headers=AUTH)
    assert ok.status_code == 200
    assert ok.json() == {"label": "not_relevant", "score": 0.2, "site_type": None}
    other = c.post("/screen", json={"image_url": "http://169.254.169.254/x"}, headers=AUTH)
    assert other.status_code == 403
    big = c.post("/screen", json={"image_url": "https://abc.supabase.co/big.jpg"}, headers=AUTH)
    assert big.status_code == 413
    miss = c.post(
        "/screen", json={"image_url": "https://abc.supabase.co/missing.jpg"}, headers=AUTH
    )
    assert miss.status_code == 502
    bad = c.post("/screen", json={"image_url": "file:///etc/passwd"}, headers=AUTH)
    assert bad.status_code == 422


def test_image_url_disabled_without_allowlist():
    c = client_for(StubModel({"drain": 1.0}))
    r = c.post("/screen", json={"image_url": "https://abc.supabase.co/p.jpg"}, headers=AUTH)
    assert r.status_code == 403


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"image_url": "https://a/x.jpg", "image_base64": "AAAA"},
        {"image_base64": "!!!not base64!!!"},
        {"image_base64": base64.b64encode(b"not an image").decode()},
    ],
)
def test_bad_requests(body):
    r = client_for(StubModel({"drain": 1.0})).post("/screen", json=body, headers=AUTH)
    assert r.status_code == 422


def test_model_error_is_503(jpeg_bytes):
    r = client_for(Boom()).post(
        "/screen", json={"image_base64": base64.b64encode(jpeg_bytes()).decode()}, headers=AUTH
    )
    assert r.status_code == 503


def test_healthz_is_public():
    assert client_for(StubModel({})).get("/healthz").json() == {"ok": True}
