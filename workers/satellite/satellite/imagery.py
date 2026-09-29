"""Planetary Computer STAC search + odc-stac loading of Sentinel-2 and Landsat composites.

Network code; heavy imports are local so the pure modules stay importable in tests.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Mapping
from typing import Any

import xarray as xr

from .config import Settings
from .indices import landsat_lst_composite, offsets_for_times, s2_index_composite
from .zonal import raster_geo, zonal_means

log = logging.getLogger(__name__)

BBox = tuple[float, float, float, float]  # lon/lat: west, south, east, north

S2_COLLECTION = "sentinel-2-l2a"
S2_BANDS = ["B03", "B04", "B08", "B11", "SCL"]
LANDSAT_COLLECTION = "landsat-c2-l2"
LANDSAT_BANDS = ["lwir11", "qa_pixel"]
CHUNKS = {"x": 2048, "y": 2048}


def open_catalog(url: str) -> Any:
    import planetary_computer
    import pystac_client

    # sign_inplace adds short-lived SAS tokens to asset hrefs (no API key needed).
    return pystac_client.Client.open(url, modifier=planetary_computer.sign_inplace)


def search_items(
    catalog: Any,
    collection: str,
    bbox: BBox,
    start: dt.date,
    end: dt.date,
    max_cloud: float,
    max_items: int,
    extra_query: Mapping[str, Any] | None = None,
) -> list[Any]:
    """Items in [start, end) under the cloud limit, least cloudy first, capped at max_items."""
    query: dict[str, Any] = {"eo:cloud_cover": {"lt": max_cloud}}
    query.update(extra_query or {})
    search = catalog.search(
        collections=[collection],
        bbox=list(bbox),
        datetime=f"{start.isoformat()}/{(end - dt.timedelta(days=1)).isoformat()}",
        query=query,
    )
    items = list(search.items())
    items.sort(key=lambda it: it.properties.get("eo:cloud_cover", 100.0))
    return items[:max_items]


def _load(items: list[Any], bands: list[str], bbox: BBox, s: Settings, res: float) -> xr.Dataset:
    import odc.stac

    return odc.stac.load(
        items,
        bands=bands,
        bbox=bbox,
        crs=s.crs,
        resolution=res,
        groupby="solar_day",
        chunks=CHUNKS,
        fail_on_error=False,  # skip an unreadable asset instead of failing the whole week
    )


def sentinel2_ward_indices(
    catalog: Any,
    geoms: Mapping[int, Mapping[str, Any]],
    bbox: BBox,
    start: dt.date,
    end: dt.date,
    s: Settings,
) -> dict[int, dict[str, float | None]]:
    items = search_items(catalog, S2_COLLECTION, bbox, start, end, s.max_cloud, s.max_items)
    log.info("sentinel-2: %d scenes %s..%s", len(items), start, end)
    if not items:
        return {}
    ds = _load(items, S2_BANDS, bbox, s, s.s2_resolution)
    baselines = {it.datetime.date(): it.properties.get("s2:processing_baseline") for it in items}
    comp = s2_index_composite(ds, offsets_for_times(ds.time.values, baselines)).compute()
    transform, crs = raster_geo(comp["ndvi"])
    out: dict[int, dict[str, float | None]] = {w: {} for w in geoms}
    for name in ("ndvi", "ndwi", "ndbi"):
        means = zonal_means(comp[name].values, transform, crs, geoms)
        for w, v in means.items():
            out[w][name] = v
    return out


def landsat_ward_lst(
    catalog: Any,
    geoms: Mapping[int, Mapping[str, Any]],
    bbox: BBox,
    start: dt.date,
    end: dt.date,
    s: Settings,
) -> dict[int, float | None]:
    items = search_items(
        catalog,
        LANDSAT_COLLECTION,
        bbox,
        start,
        end,
        s.max_cloud,
        s.max_items,
        extra_query={"platform": {"in": ["landsat-8", "landsat-9"]}},
    )
    log.info("landsat: %d scenes %s..%s", len(items), start, end)
    if not items:
        return {}
    ds = _load(items, LANDSAT_BANDS, bbox, s, s.landsat_resolution)
    lst = landsat_lst_composite(ds).compute()
    transform, crs = raster_geo(lst)
    return zonal_means(lst.values, transform, crs, geoms)
