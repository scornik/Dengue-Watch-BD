"""Screening API: POST /screen -> {"label", "score", "site_type"}.

Run:  uvicorn --factory detector.serve:app_factory --host 0.0.0.0 --port 8080

Auth: `Authorization: Bearer $DETECTOR_TOKEN` (constant-time comparison). The server refuses to
start without a token. `image_url` fetching is restricted to an allow-list of hosts (default:
the SUPABASE_URL host) with redirects disabled and a size cap, to avoid SSRF; if no host is
allowed, only `image_base64` is accepted.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import io
import os
from collections.abc import Collection
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, model_validator

from .screen import Classifier, Thresholds, decide


class ScreenRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    image_url: str | None = None
    image_base64: str | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> ScreenRequest:
        if bool(self.image_url) == bool(self.image_base64):
            raise ValueError("provide exactly one of image_url or image_base64")
        return self


class ScreenResponse(BaseModel):
    label: Literal["likely", "unclear", "not_relevant"]
    score: float
    site_type: str | None


def _fetch_url(
    client: httpx.Client, url: str, allowed_hosts: Collection[str], max_bytes: int
) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(422, "image_url must be http(s)")
    if parsed.hostname.lower() not in allowed_hosts:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "image_url host is not allowed")
    buf = bytearray()
    try:
        with client.stream("GET", url, follow_redirects=False) as resp:
            if resp.status_code != 200:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY, f"image fetch returned {resp.status_code}"
                )
            for chunk in resp.iter_bytes():
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise HTTPException(413, "image too large")
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "image fetch failed") from exc
    return bytes(buf)


def _decode_b64(data: str, max_bytes: int) -> bytes:
    if data.startswith("data:"):
        data = data.partition(",")[2]
    if len(data) * 3 // 4 > max_bytes:
        raise HTTPException(413, "image too large")
    try:
        return base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "invalid base64") from exc


def _open_image(data: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data)) as im:
            return ImageOps.exif_transpose(im).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "not a readable image") from exc


def create_app(
    classifier: Classifier,
    token: str,
    *,
    http_client: httpx.Client | None = None,
    allowed_hosts: Collection[str] = (),
    max_bytes: int = 10 * 1024 * 1024,
    thresholds: Thresholds | None = None,
) -> FastAPI:
    if not token:
        raise RuntimeError("DETECTOR_TOKEN must be set")
    client = http_client or httpx.Client(timeout=15.0)
    hosts = {h.strip().lower() for h in allowed_hosts if h.strip()}
    app = FastAPI(title="DengueWatch BD detector", version="0.1.0")

    def require_token(authorization: str | None = Header(default=None)) -> None:
        scheme, _, given = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(
            given.strip().encode(), token.encode()
        ):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "invalid or missing bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.get("/healthz")
    def healthz() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/screen", response_model=ScreenResponse, dependencies=[Depends(require_token)])
    def screen(req: ScreenRequest) -> dict[str, object]:
        if req.image_url:
            if not hosts:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "image_url is disabled")
            data = _fetch_url(client, req.image_url, hosts, max_bytes)
        else:
            data = _decode_b64(req.image_base64 or "", max_bytes)
        image = _open_image(data)
        try:
            probs = classifier.predict(image)
        except Exception as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "model error") from exc
        return decide(probs, thresholds)

    return app


def app_factory() -> FastAPI:
    """Build the production app from environment variables."""
    from .screen import UltralyticsClassifier

    hosts_env = os.environ.get("DETECTOR_ALLOWED_HOSTS", "")
    hosts = [h for h in hosts_env.split(",") if h.strip()]
    if not hosts and os.environ.get("SUPABASE_URL"):
        hosts = [urlparse(os.environ["SUPABASE_URL"]).hostname or ""]
    return create_app(
        UltralyticsClassifier(
            os.environ.get("DETECTOR_WEIGHTS", "/models/best.pt"),
            imgsz=int(os.environ.get("DETECTOR_IMGSZ", "224")),
        ),
        os.environ.get("DETECTOR_TOKEN", ""),
        allowed_hosts=hosts,
        max_bytes=int(float(os.environ.get("DETECTOR_MAX_IMAGE_MB", "10")) * 1024 * 1024),
        thresholds=Thresholds(
            likely=float(os.environ.get("DETECTOR_LIKELY_THRESHOLD", "0.7")),
            not_relevant=float(os.environ.get("DETECTOR_NOT_RELEVANT_THRESHOLD", "0.7")),
        ),
    )
