"""Pure raster maths: cloud masks, spectral indices, LST conversion and median composites.

Everything here works on xarray objects (numpy- or dask-backed) and is unit-tested with
synthetic arrays; no network access.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable, Mapping

import numpy as np
import xarray as xr

# Sentinel-2 L2A scene classification (SCL) classes we KEEP:
# 4 vegetation, 5 not vegetated, 6 water, 7 unclassified.
# Dropped: 0 no data, 1 saturated/defective, 2 dark area/topographic shadow, 3 cloud shadow,
# 8 cloud medium prob., 9 cloud high prob., 10 thin cirrus, 11 snow/ice.
SCL_KEEP: tuple[int, ...] = (4, 5, 6, 7)

# Landsat Collection 2 QA_PIXEL bits that mark a pixel as unusable:
# 0 fill, 1 dilated cloud, 3 cloud, 4 cloud shadow.
QA_BAD_BITS: tuple[int, ...] = (0, 1, 3, 4)
QA_BAD_MASK = sum(1 << b for b in QA_BAD_BITS)

# Landsat C2 L2 surface temperature (ST_B10 / "lwir11") scaling to Kelvin.
ST_SCALE = 0.00341802
ST_OFFSET = 149.0
KELVIN = 273.15

# Sentinel-2 L2A digital numbers -> reflectance. From processing baseline 04.00 (Jan 2022)
# ESA adds BOA_ADD_OFFSET = -1000 to every band; Planetary Computer serves the raw DNs.
S2_SCALE = 1e-4
S2_BASELINE_OFFSET = -1000


def scl_clear(scl: xr.DataArray) -> xr.DataArray:
    return scl.isin(list(SCL_KEEP))


def qa_clear(qa: xr.DataArray) -> xr.DataArray:
    return (qa.astype("uint32") & QA_BAD_MASK) == 0


def normalized_difference(a: xr.DataArray, b: xr.DataArray) -> xr.DataArray:
    """(a - b) / (a + b), NaN where the denominator is 0 or inputs are NaN."""
    den = a + b
    return (a - b) / den.where(den != 0)


def st_to_celsius(dn: xr.DataArray) -> xr.DataArray:
    """Landsat ST_B10 digital number -> degrees Celsius; DN 0 is no-data."""
    return (dn.astype("float32") * ST_SCALE + ST_OFFSET - KELVIN).where(dn != 0)


def baseline_offset(processing_baseline: str | None) -> int:
    """BOA_ADD_OFFSET for a Sentinel-2 processing baseline string such as "05.10"."""
    if not processing_baseline:
        return 0
    try:
        return S2_BASELINE_OFFSET if float(processing_baseline) >= 4.0 else 0
    except ValueError:
        return 0


def offsets_for_times(
    times: Iterable[np.datetime64], item_days: Mapping[dt.date, str | None]
) -> list[int]:
    """Per-time-slice offsets, matching odc-stac's solar-day groups to item baselines."""
    out = []
    for t in times:
        day = np.datetime64(t, "D").astype(dt.date)
        out.append(baseline_offset(item_days.get(day)))
    return out


def _median_time(da: xr.DataArray) -> xr.DataArray:
    if da.chunks is not None:  # dask: median needs the whole time axis in one chunk
        da = da.chunk({"time": -1})
    return da.median("time", skipna=True)


def s2_index_composite(ds: xr.Dataset, offsets: list[int] | None = None) -> xr.Dataset:
    """Median NDVI, MNDWI and NDBI over time from S2 bands B03, B04, B08, B11 and SCL.

    Indices are computed per scene (after masking) and then median-composited, which is more
    robust to residual haze than compositing bands first.
    """
    clear = scl_clear(ds["SCL"])
    off = xr.DataArray(offsets or [0] * ds.sizes["time"], dims="time", coords={"time": ds.time})

    def refl(band: str) -> xr.DataArray:
        dn = ds[band]
        r = ((dn.astype("float32") + off) * S2_SCALE).clip(min=0)
        return r.where(clear & (dn > 0))

    b03, b04, b08, b11 = refl("B03"), refl("B04"), refl("B08"), refl("B11")
    return xr.Dataset(
        {
            "ndvi": _median_time(normalized_difference(b08, b04)),
            "ndwi": _median_time(normalized_difference(b03, b11)),  # MNDWI (Xu 2006)
            "ndbi": _median_time(normalized_difference(b11, b08)),
        }
    )


def landsat_lst_composite(ds: xr.Dataset) -> xr.DataArray:
    """Median land surface temperature (deg C) over time from lwir11 + qa_pixel."""
    lst = st_to_celsius(ds["lwir11"]).where(qa_clear(ds["qa_pixel"]))
    return _median_time(lst)
