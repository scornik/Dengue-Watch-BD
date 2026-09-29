"""14-day rainfall per ward centroid from Open-Meteo (free, no API key).

Many coordinates are sent in one request (comma-separated latitude/longitude lists). Points
are rounded to 0.01 deg (~1 km), which is finer than the weather model grid, to deduplicate.
If a batch fails, the city centroid's rainfall is used for every ward in that batch.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Mapping, Sequence
from typing import Any

import httpx

log = logging.getLogger(__name__)

Point = tuple[float, float]  # (lat, lon)
BATCH = 50
ARCHIVE_AFTER_DAYS = 80  # older than this -> archive API; else forecast API (past ~3 months)


def _endpoint(end: dt.date, today: dt.date, forecast_url: str, archive_url: str) -> str:
    return archive_url if (today - end).days > ARCHIVE_AFTER_DAYS else forecast_url


def _sum_payload(payload: Any, n: int) -> list[float | None]:
    locs = payload if isinstance(payload, list) else [payload]
    if len(locs) != n:
        raise ValueError(f"expected {n} locations, got {len(locs)}")
    out: list[float | None] = []
    for loc in locs:
        vals = [v for v in (loc.get("daily") or {}).get("precipitation_sum", []) if v is not None]
        out.append(float(sum(vals)) if vals else None)
    return out


def fetch_rain_sums(
    client: httpx.Client,
    points: Sequence[Point],
    start: dt.date,
    end: dt.date,
    *,
    forecast_url: str,
    archive_url: str,
    today: dt.date | None = None,
) -> list[float | None]:
    """Precipitation sum (mm) over [start, end] inclusive for each point, one request per batch."""
    url = _endpoint(end, today or dt.date.today(), forecast_url, archive_url)
    out: list[float | None] = []
    for i in range(0, len(points), BATCH):
        batch = points[i : i + BATCH]
        resp = client.get(
            url,
            params={
                "latitude": ",".join(f"{lat:.4f}" for lat, _ in batch),
                "longitude": ",".join(f"{lon:.4f}" for _, lon in batch),
                "daily": "precipitation_sum",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "timezone": "Asia/Dhaka",
            },
        )
        resp.raise_for_status()
        out.extend(_sum_payload(resp.json(), len(batch)))
    return out


def ward_rainfall(
    client: httpx.Client,
    centroids: Mapping[int, Point],
    start: dt.date,
    end: dt.date,
    *,
    fallback: Point,
    forecast_url: str,
    archive_url: str,
    today: dt.date | None = None,
) -> dict[int, float | None]:
    """Rainfall per ward; degrades to the city centroid, then to None (logged)."""

    def fetch(points: Sequence[Point]) -> list[float | None]:
        return fetch_rain_sums(
            client, points, start, end,
            forecast_url=forecast_url, archive_url=archive_url, today=today,
        )  # fmt: skip

    rounded = {w: (round(lat, 2), round(lon, 2)) for w, (lat, lon) in centroids.items()}
    unique = sorted(set(rounded.values()))
    try:
        sums = fetch(unique)
        by_point = dict(zip(unique, sums, strict=True))
        return {w: by_point[p] for w, p in rounded.items()}
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        log.warning("per-ward rainfall failed (%s); falling back to city centroid", exc)
    try:
        (city,) = fetch([fallback])
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        log.warning("city rainfall failed too (%s); rain feature will be missing", exc)
        city = None
    return dict.fromkeys(centroids, city)
