"""Runtime settings from environment variables (see README for the full table)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

DEFAULT_WEIGHTS = Path(__file__).resolve().parent.parent / "weights.yaml"


def _get(env: Mapping[str, str], key: str, default: str) -> str:
    value = env.get(key, "").strip()
    return value or default


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str | None
    lookback_days: int = 60
    max_cloud: float = 40.0
    max_items: int = 30
    stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    # UTM zone 46N covers Dhaka (90-96 E); rasters are loaded in metres in this CRS.
    crs: str = "EPSG:32646"
    s2_resolution: float = 20.0
    landsat_resolution: float = 30.0
    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    rain_days: int = 14
    report_window_days: int = 28
    case_window_days: int = 14
    city_lat: float = 23.8103
    city_lon: float = 90.4125
    weights_path: Path = DEFAULT_WEIGHTS
    http_timeout: float = 60.0

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        d = cls(database_url=None)
        return cls(
            database_url=env.get("DATABASE_URL") or None,
            lookback_days=int(_get(env, "LOOKBACK_DAYS", str(d.lookback_days))),
            max_cloud=float(_get(env, "MAX_CLOUD_COVER", str(d.max_cloud))),
            max_items=int(_get(env, "STAC_MAX_ITEMS", str(d.max_items))),
            stac_url=_get(env, "STAC_URL", d.stac_url),
            crs=_get(env, "TARGET_CRS", d.crs),
            s2_resolution=float(_get(env, "S2_RESOLUTION_M", str(d.s2_resolution))),
            landsat_resolution=float(_get(env, "LANDSAT_RESOLUTION_M", str(d.landsat_resolution))),
            open_meteo_forecast_url=_get(env, "OPEN_METEO_URL", d.open_meteo_forecast_url),
            open_meteo_archive_url=_get(env, "OPEN_METEO_ARCHIVE_URL", d.open_meteo_archive_url),
            city_lat=float(_get(env, "CITY_LAT", str(d.city_lat))),
            city_lon=float(_get(env, "CITY_LON", str(d.city_lon))),
            weights_path=Path(_get(env, "WEIGHTS_PATH", str(d.weights_path))),
            http_timeout=float(_get(env, "HTTP_TIMEOUT", str(d.http_timeout))),
        )
