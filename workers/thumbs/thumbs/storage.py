"""Minimal Supabase Storage REST client (service-role key; server-side only)."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from urllib.parse import quote

import httpx

SOURCE_BUCKET = "report-photos"  # private: report originals
CLEANUP_BUCKET = "cleanup-photos"  # private: volunteer cleanup "after" photos
THUMB_BUCKET = "public-thumbs"  # public


# Object keys come from DB rows; only plain relative paths may reach a storage URL. The
# character set excludes '%', '\\', '?', '#', whitespace and control characters.
_SAFE_KEY = re.compile(r"[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*")


class ObjectNotFound(Exception):
    pass


class InvalidKey(ValueError):
    pass


def check_key(key: str) -> str:
    """Return `key` if it is a plain relative object path, else raise InvalidKey."""
    if not _SAFE_KEY.fullmatch(key) or any(p in (".", "..") for p in key.split("/")):
        raise InvalidKey(f"unsafe storage key: {key!r}")
    return key


@dataclass(frozen=True, slots=True)
class StorageConfig:
    url: str
    service_key: str

    @classmethod
    def from_env(cls) -> StorageConfig:
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        return cls(url, key)

    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.service_key}", "apikey": self.service_key}

    def object_url(self, bucket: str, key: str) -> str:
        return f"{self.url}/storage/v1/object/{quote(bucket)}/{quote(check_key(key))}"


def _not_found(resp: httpx.Response) -> bool:
    # Supabase Storage reports a missing object as 404, or 400 with "not_found" in older versions.
    return resp.status_code == 404 or (resp.status_code == 400 and "not" in resp.text.lower())


def download(client: httpx.Client, cfg: StorageConfig, bucket: str, key: str) -> bytes:
    resp = client.get(cfg.object_url(bucket, key), headers=cfg.headers())
    if _not_found(resp):
        raise ObjectNotFound(f"{bucket}/{key}")
    resp.raise_for_status()
    return resp.content


def upload_jpeg(
    client: httpx.Client, cfg: StorageConfig, bucket: str, key: str, data: bytes
) -> None:
    resp = client.post(
        cfg.object_url(bucket, key),
        headers={
            **cfg.headers(),
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
            "cache-control": "max-age=3600",
        },
        content=data,
    )
    resp.raise_for_status()


def delete_object(client: httpx.Client, cfg: StorageConfig, bucket: str, key: str) -> None:
    """Delete one object; an already-missing object counts as deleted (idempotent)."""
    resp = client.delete(cfg.object_url(bucket, key), headers=cfg.headers())
    if _not_found(resp):
        return
    resp.raise_for_status()
