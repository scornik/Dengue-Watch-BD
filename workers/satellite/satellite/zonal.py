"""Per-ward zonal means with rasterio's geometry_mask (own implementation; no GPL deps)."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

import numpy as np
import xarray as xr
from affine import Affine
from rasterio.features import bounds as geom_bounds
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom


def raster_geo(da: xr.DataArray) -> tuple[Affine, str]:
    """Affine transform and CRS string of a 2-D georeferenced DataArray (via rioxarray)."""
    import rioxarray  # noqa: F401  (registers the .rio accessor)

    crs = da.rio.crs
    if crs is None:
        raise ValueError("raster has no CRS")
    return da.rio.transform(), crs.to_string()


def _window(
    geom: Mapping[str, Any], transform: Affine, shape: tuple[int, int]
) -> tuple[int, int, int, int] | None:
    """Pixel window (row0, row1, col0, col1) covering the geometry's bounds, clipped."""
    minx, miny, maxx, maxy = geom_bounds(geom)
    inv = ~transform
    corners = [inv @ (x, y) for x in (minx, maxx) for y in (miny, maxy)]
    cols = [c for c, _ in corners]
    rows = [r for _, r in corners]
    r0 = max(0, math.floor(min(rows)) - 1)
    r1 = min(shape[0], math.ceil(max(rows)) + 1)
    c0 = max(0, math.floor(min(cols)) - 1)
    c1 = min(shape[1], math.ceil(max(cols)) + 1)
    if r0 >= r1 or c0 >= c1:
        return None
    return r0, r1, c0, c1


def zonal_means(
    raster: np.ndarray,
    transform: Affine,
    crs: str,
    geoms: Mapping[int, Mapping[str, Any]],
    *,
    geoms_crs: str = "EPSG:4326",
    min_pixels: int = 1,
) -> dict[int, float | None]:
    """Mean of finite raster values whose pixel centres fall inside each geometry.

    Small or thin wards that contain no pixel centre fall back to `all_touched=True`.
    Returns None for wards outside the raster or with only NaN pixels (e.g. all cloud).
    """
    if raster.ndim != 2:
        raise ValueError("raster must be 2-D")
    out: dict[int, float | None] = {}
    for ward_id, geom in geoms.items():
        g = transform_geom(geoms_crs, crs, dict(geom)) if geoms_crs != crs else dict(geom)
        win = _window(g, transform, raster.shape)
        if win is None:
            out[ward_id] = None
            continue
        r0, r1, c0, c1 = win
        sub = raster[r0:r1, c0:c1]
        sub_t = transform @ Affine.translation(c0, r0)
        inside = geometry_mask([g], out_shape=sub.shape, transform=sub_t, invert=True)
        if not inside.any():
            inside = geometry_mask(
                [g], out_shape=sub.shape, transform=sub_t, invert=True, all_touched=True
            )
        vals = sub[inside]
        vals = vals[np.isfinite(vals)]
        out[ward_id] = float(vals.mean()) if vals.size >= min_pixels else None
    return out
