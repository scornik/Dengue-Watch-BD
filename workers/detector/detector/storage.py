"""Minimal Supabase Storage REST client (service-role key, server-side only)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote

import httpx


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

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.service_key}", "apikey": self.service_key}


def download(client: httpx.Client, cfg: StorageConfig, bucket: str, path: str) -> bytes:
    """GET /storage/v1/object/{bucket}/{path} (works for private buckets with the service key)."""
    resp = client.get(
        f"{cfg.url}/storage/v1/object/{quote(bucket)}/{quote(path.lstrip('/'))}",
        headers=cfg.headers,
    )
    resp.raise_for_status()
    return resp.content
