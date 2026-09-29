import datetime as dt

import numpy as np
import pytest
import xarray as xr

from satellite.indices import (
    baseline_offset,
    landsat_lst_composite,
    normalized_difference,
    offsets_for_times,
    qa_clear,
    s2_index_composite,
    scl_clear,
    st_to_celsius,
)


def da(values, dims=("y", "x")):
    return xr.DataArray(np.asarray(values), dims=dims)


def test_scl_mask_keeps_only_4_to_7():
    scl = da(np.arange(12).reshape(3, 4))
    keep = scl_clear(scl).values.ravel().tolist()
    assert [i for i, k in enumerate(keep) if k] == [4, 5, 6, 7]


def test_qa_mask_bits():
    # bit0 fill, bit1 dilated cloud, bit3 cloud, bit4 shadow are bad; bit2 cirrus, bit6 clear ok.
    qa = da([[0, 1, 2, 8], [16, 4, 64, 64 | 8]])
    assert qa_clear(qa).values.tolist() == [[True, False, False, False], [False, True, True, False]]


def test_normalized_difference_and_zero_denominator():
    a, b = da([[0.5, 0.0]]), da([[0.1, 0.0]])
    nd = normalized_difference(a, b).values
    assert nd[0, 0] == pytest.approx(0.4 / 0.6)
    assert np.isnan(nd[0, 1])


def test_st_to_celsius():
    out = st_to_celsius(da([[0, 44000]], dims=("y", "x"))).values
    assert np.isnan(out[0, 0])
    assert out[0, 1] == pytest.approx(44000 * 0.00341802 + 149.0 - 273.15, rel=1e-5)
    assert 25 < out[0, 1] < 30


@pytest.mark.parametrize(
    ("baseline", "offset"), [("05.10", -1000), ("04.00", -1000), ("03.01", 0), (None, 0), ("x", 0)]
)
def test_baseline_offset(baseline, offset):
    assert baseline_offset(baseline) == offset


def test_offsets_for_times():
    times = np.array(["2026-08-01T04:30:00", "2026-08-06T04:30:00"], dtype="datetime64[ns]")
    got = offsets_for_times(times, {dt.date(2026, 8, 1): "05.11", dt.date(2026, 8, 6): "03.00"})
    assert got == [-1000, 0]


def _s2_dataset(scl_t1: int = 4) -> xr.Dataset:
    """Two 1x2-pixel scenes; offsets applied: DN = reflectance*1e4 + 1000."""
    t = np.array(["2026-08-01", "2026-08-06"], dtype="datetime64[ns]")

    def band(v1, v2):
        return xr.DataArray(
            np.array([[[v1, v1]], [[v2, v2]]], dtype="uint16"),
            dims=("time", "y", "x"),
            coords={"time": t},
        )

    return xr.Dataset(
        {
            "B03": band(1000 + 500, 1000 + 900),
            "B04": band(1000 + 500, 1000 + 900),
            "B08": band(1000 + 3000, 1000 + 900),
            "B11": band(1000 + 1500, 1000 + 900),
            "SCL": xr.DataArray(
                np.array([[[4, 4]], [[scl_t1, 0]]], dtype="uint8"),
                dims=("time", "y", "x"),
                coords={"time": t},
            ),
        }
    )


def test_s2_composite_masks_clouds_and_applies_offset():
    comp = s2_index_composite(_s2_dataset(scl_t1=9), offsets=[-1000, -1000])
    # Scene 2 is cloud (9) / no-data (0) everywhere, so only scene 1 counts.
    assert comp["ndvi"].values.ravel() == pytest.approx([2500 / 3500] * 2)
    assert comp["ndwi"].values.ravel() == pytest.approx([-1000 / 2000] * 2)
    assert comp["ndbi"].values.ravel() == pytest.approx([-1500 / 4500] * 2)


def test_s2_composite_median_over_clear_scenes():
    comp = s2_index_composite(_s2_dataset(scl_t1=5), offsets=[-1000, -1000])
    # Pixel 0: both scenes clear -> median of (0.714..., 0.0); pixel 1: scene 2 no-data.
    assert comp["ndvi"].values[0, 0] == pytest.approx((2500 / 3500 + 0.0) / 2)
    assert comp["ndvi"].values[0, 1] == pytest.approx(2500 / 3500)


def test_s2_composite_without_offset_differs():
    with_off = s2_index_composite(_s2_dataset(9), offsets=[-1000, -1000])["ndvi"].values[0, 0]
    no_off = s2_index_composite(_s2_dataset(9), offsets=None)["ndvi"].values[0, 0]
    assert no_off == pytest.approx(2500 / 5500)
    assert with_off != pytest.approx(no_off)


def test_s2_composite_dask_backed():
    ds = _s2_dataset(scl_t1=5).chunk({"time": 1})
    comp = s2_index_composite(ds, offsets=[-1000, -1000]).compute()
    assert comp["ndvi"].values[0, 1] == pytest.approx(2500 / 3500)


def test_landsat_lst_composite():
    t = np.array(["2026-08-01", "2026-08-17", "2026-09-02"], dtype="datetime64[ns]")
    lwir = xr.DataArray(
        np.array([[[44000]], [[45000]], [[0]]], dtype="uint16"), dims=("time", "y", "x"),
        coords={"time": t},
    )  # fmt: skip
    qa = xr.DataArray(
        np.array([[[64]], [[64 | 8]], [[1]]], dtype="uint16"), dims=("time", "y", "x"),
        coords={"time": t},
    )  # fmt: skip
    lst = landsat_lst_composite(xr.Dataset({"lwir11": lwir, "qa_pixel": qa}))
    assert lst.values[0, 0] == pytest.approx(44000 * 0.00341802 + 149.0 - 273.15, rel=1e-5)
