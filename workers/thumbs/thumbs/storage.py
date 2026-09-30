"""Minimal Supabase Storage REST client (service-role key; server-side only)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote

import httpx

SOURCE_BUCKET = "report-photos"  # private: report originals
CLEANUP_BUCKET = "cleanup-photos"  # private: volunteer cleanup "after" photos
THUMB_BUCKET = "public-thumbs"  # public


class ObjectNotFound(Exception):
    pass


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
        return f"{self.url}/storage/v1/object/{quote(bucket)}/{quote(key.lstrip('/'))}"


def download(client: httpx.Client, cfg: StorageConfig, bucket: str, key: str) -> bytes:
    resp = client.get(cfg.object_url(bucket, key), headers=cfg.headers())
    # Supabase Storage reports a missing object as 404, or 400 with "not_found" in older versions.
    if resp.status_code == 404 or (resp.status_code == 400 and "not" in resp.text.lower()):
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
