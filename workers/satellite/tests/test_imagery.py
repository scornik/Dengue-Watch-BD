"""Glue test for imagery.py with a fake STAC catalog and a synthetic odc-stac result."""

import datetime as dt
from types import SimpleNamespace

import numpy as np
import pytest
import rioxarray  # noqa: F401
import xarray as xr

from satellite import imagery
from satellite.config import Settings


class FakeCatalog:
    def __init__(self, items):
        self.items = items
        self.calls = []

    def search(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(items=lambda: iter(self.items))


def item(day, cloud, baseline="05.11"):
    return SimpleNamespace(
        datetime=dt.datetime(2026, 9, day, 4, 30, tzinfo=dt.UTC),
        properties={"eo:cloud_cover": cloud, "s2:processing_baseline": baseline},
    )


def georef(ds):
    ys = 23.8 - 0.005 - 0.01 * np.arange(ds.sizes["y"])
    xs = 90.4 + 0.005 + 0.01 * np.arange(ds.sizes["x"])
    return ds.assign_coords(y=ys, x=xs).rio.write_crs("EPSG:4326")


WARD = {
    "type": "MultiPolygon",
    "coordinates": [[[[90.4, 23.78], [90.42, 23.78], [90.42, 23.8], [90.4, 23.8], [90.4, 23.78]]]],
}


def test_search_sorts_by_cloud_and_caps():
    cat = FakeCatalog([item(1, 30), item(2, 5), item(3, 12)])
    got = imagery.search_items(
        cat, "sentinel-2-l2a", (90, 23, 91, 24), dt.date(2026, 8, 1), dt.date(2026, 9, 28), 40, 2
    )
    assert [i.properties["eo:cloud_cover"] for i in got] == [5, 12]
    assert cat.calls[0]["datetime"] == "2026-08-01/2026-09-27"
    assert cat.calls[0]["query"] == {"eo:cloud_cover": {"lt": 40}}


def test_sentinel2_ward_indices(monkeypatch):
    t = np.array(["2026-09-01", "2026-09-02"], dtype="datetime64[ns]")
    shape = (2, 4, 4)

    def band(v):
        return (("time", "y", "x"), np.full(shape, v, dtype="uint16"))

    ds = georef(
        xr.Dataset(
            {"B03": band(1500), "B04": band(1500), "B08": band(4000), "B11": band(2500),
             "SCL": (("time", "y", "x"), np.full(shape, 4, dtype="uint8"))},
            coords={"time": t},
        )
    )  # fmt: skip
    monkeypatch.setattr(imagery, "_load", lambda *a, **k: ds)
    cat = FakeCatalog([item(1, 5), item(2, 6)])
    out = imagery.sentinel2_ward_indices(
        cat, {7: WARD}, (90.4, 23.76, 90.44, 23.8), dt.date(2026, 8, 1), dt.date(2026, 9, 28),
        Settings(database_url=None),
    )  # fmt: skip
    # Baseline 05.11 -> offset -1000: B04=0.05, B08=0.30, B03=0.05, B11=0.15
    assert out[7]["ndvi"] == pytest.approx(0.25 / 0.35)
    assert out[7]["ndwi"] == pytest.approx(-0.10 / 0.20)
    assert out[7]["ndbi"] == pytest.approx(-0.15 / 0.45)


def test_landsat_ward_lst(monkeypatch):
    t = np.array(["2026-09-01"], dtype="datetime64[ns]")
    ds = georef(
        xr.Dataset(
            {"lwir11": (("time", "y", "x"), np.full((1, 4, 4), 44000, dtype="uint16")),
             "qa_pixel": (("time", "y", "x"), np.full((1, 4, 4), 64, dtype="uint16"))},
            coords={"time": t},
        )
    )  # fmt: skip
    monkeypatch.setattr(imagery, "_load", lambda *a, **k: ds)
    cat = FakeCatalog([item(1, 5)])
    out = imagery.landsat_ward_lst(
        cat, {7: WARD}, (90.4, 23.76, 90.44, 23.8), dt.date(2026, 8, 1), dt.date(2026, 9, 28),
        Settings(database_url=None),
    )  # fmt: skip
    assert out[7] == pytest.approx(44000 * 0.00341802 + 149.0 - 273.15, rel=1e-5)
    assert cat.calls[0]["query"]["platform"] == {"in": ["landsat-8", "landsat-9"]}


def test_no_scenes_returns_empty():
    out = imagery.sentinel2_ward_indices(
        FakeCatalog([]), {7: WARD}, (90, 23, 91, 24), dt.date(2026, 8, 1), dt.date(2026, 9, 28),
        Settings(database_url=None),
    )  # fmt: skip
    assert out == {}
