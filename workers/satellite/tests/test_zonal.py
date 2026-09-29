import numpy as np
import pytest
import xarray as xr
from affine import Affine
from rasterio.warp import transform as warp_transform

from satellite.zonal import raster_geo, zonal_means


def square(x0, y0, x1, y1):
    return {
        "type": "MultiPolygon",
        "coordinates": [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]],
    }


# 10x10 raster over lon 90.0-90.1, lat 23.7-23.8 (0.01 deg pixels), north-up.
T4326 = Affine(0.01, 0, 90.0, 0, -0.01, 23.8)
RASTER = np.arange(100, dtype="float64").reshape(10, 10)


def test_zonal_mean_simple_square():
    # Left-top 2x2 pixels: values 0, 1, 10, 11.
    out = zonal_means(RASTER, T4326, "EPSG:4326", {1: square(90.0, 23.78, 90.02, 23.8)})
    assert out[1] == pytest.approx(5.5)


def test_zonal_ignores_nan_and_handles_outside_and_all_nan():
    r = RASTER.copy()
    r[0, 0] = np.nan
    r[5:7, 5:7] = np.nan
    geoms = {
        1: square(90.0, 23.78, 90.02, 23.8),  # has one NaN
        2: square(91.0, 24.0, 91.1, 24.1),  # outside the raster
        3: square(90.05, 23.73, 90.07, 23.75),  # only NaN pixels
    }
    out = zonal_means(r, T4326, "EPSG:4326", geoms)
    assert out[1] == pytest.approx((1 + 10 + 11) / 3)
    assert out[2] is None
    assert out[3] is None


def test_tiny_ward_falls_back_to_all_touched():
    # Smaller than a pixel and not covering any pixel centre.
    out = zonal_means(RASTER, T4326, "EPSG:4326", {1: square(90.031, 23.761, 90.034, 23.764)})
    assert out[1] == pytest.approx(RASTER[3, 3])


def test_geometry_reprojected_to_raster_crs():
    # Build a 100 m UTM 46N raster whose pixel values encode column index.
    xs, ys = warp_transform("EPSG:4326", "EPSG:32646", [90.4], [23.8])
    x0, y0 = round(xs[0], -2), round(ys[0], -2)
    t = Affine(100, 0, x0, 0, -100, y0)
    raster = np.tile(np.arange(20, dtype="float64"), (20, 1))
    # Ward covering columns 5..9 (in UTM), expressed in lon/lat.
    lons, lats = warp_transform(
        "EPSG:32646", "EPSG:4326", [x0 + 500, x0 + 1000], [y0 - 1000, y0 - 500]
    )
    geom = square(lons[0], lats[0], lons[1], lats[1])
    out = zonal_means(raster, t, "EPSG:32646", {7: geom})
    assert out[7] == pytest.approx(7.0, abs=0.5)


def test_raster_geo_from_rioxarray_coords():
    import rioxarray  # noqa: F401

    da = xr.DataArray(
        RASTER,
        dims=("y", "x"),
        coords={"y": 23.8 - 0.005 - 0.01 * np.arange(10), "x": 90.005 + 0.01 * np.arange(10)},
    ).rio.write_crs("EPSG:4326")
    transform, crs = raster_geo(da)
    assert crs == "EPSG:4326"
    assert transform.almost_equals(T4326)


def test_rejects_non_2d():
    with pytest.raises(ValueError):
        zonal_means(np.zeros((2, 2, 2)), T4326, "EPSG:4326", {})
