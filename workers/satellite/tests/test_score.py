import math

import pytest

from satellite.config import DEFAULT_WEIGHTS
from satellite.score import (
    FEATURES,
    ScoreConfig,
    config_from_dict,
    level_for,
    load_config,
    percentile_ranks,
    score_wards,
    zscores,
)


def cfg(**kw):
    base = {"version": "test", "weights": {"lst_c": 1.0}, "z_clip": None}
    base.update(kw)
    return ScoreConfig(**base)


# --- zscores --------------------------------------------------------------------------------


def test_zscores_population_std():
    z = zscores([1.0, 2.0, 3.0])
    std = math.sqrt(2 / 3)
    assert z == pytest.approx([-1 / std, 0.0, 1 / std])
    assert sum(z) == pytest.approx(0.0)


def test_zscores_zero_std_gives_zero():
    assert zscores([5.0, 5.0, 5.0]) == [0.0, 0.0, 0.0]


def test_zscores_missing_and_nan_are_neutral_and_excluded_from_stats():
    z = zscores([1.0, None, 3.0, float("nan")])
    assert z[1] == 0.0 and z[3] == 0.0
    assert z[0] == pytest.approx(-1.0) and z[2] == pytest.approx(1.0)


def test_zscores_fewer_than_two_values():
    assert zscores([]) == []
    assert zscores([None, 4.0, None]) == [0.0, 0.0, 0.0]


def test_zscores_clip():
    vals = [0.0] * 99 + [100.0]
    assert max(zscores(vals, clip=3.0)) == 3.0
    assert max(zscores(vals)) > 3.0


def test_zscores_tiny_float_noise_is_zero_std():
    assert zscores([0.1 + 0.2, 0.3, 0.30000000000000004]) == [0.0, 0.0, 0.0]


# --- levels ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("score", "level"),
    [(-2.0, "green"), (-0.5, "yellow"), (0.0, "yellow"), (0.25, "orange"), (0.99, "orange"),
     (1.0, "red"), (5.0, "red")],
)  # fmt: skip
def test_level_for_thresholds(score, level):
    assert level_for(score, (-0.5, 0.25, 1.0)) == level


def test_percentile_ranks_ties_share_mid_rank():
    assert percentile_ranks([1.0, 2.0, 2.0, 3.0]) == [0.125, 0.5, 0.5, 0.875]
    assert percentile_ranks([7.0, 7.0]) == [0.5, 0.5]


# --- score_wards ----------------------------------------------------------------------------


def test_sign_convention_ndvi_negative_lowers_risk():
    c = cfg(weights={"ndvi": -1.0})
    s = score_wards({1: {"ndvi": 0.6}, 2: {"ndvi": 0.1}}, c)
    assert s[2].score > s[1].score  # less vegetation -> higher risk
    assert s[1].z["ndvi"] == pytest.approx(1.0)
    assert s[1].score == pytest.approx(-1.0)


def test_normalized_weighted_mean():
    c = cfg(weights={"lst_c": 2.0, "rain_14d_mm": 1.0, "ndvi": -1.0}, normalize=True)
    feats = {
        1: {"lst_c": 30.0, "rain_14d_mm": 10.0, "ndvi": 0.5},
        2: {"lst_c": 34.0, "rain_14d_mm": 50.0, "ndvi": 0.1},
    }
    s = score_wards(feats, c)
    # Each feature has z = -1 / +1 for the two wards.
    assert s[2].score == pytest.approx((2 * 1 + 1 * 1 + (-1) * (-1)) / 4)
    assert s[1].score == pytest.approx(-s[2].score)


def test_unnormalized_weighted_sum():
    c = cfg(weights={"lst_c": 2.0, "rain_14d_mm": 1.0}, normalize=False)
    s = score_wards(
        {1: {"lst_c": 1.0, "rain_14d_mm": 1.0}, 2: {"lst_c": 3.0, "rain_14d_mm": 3.0}}, c
    )
    assert s[2].score == pytest.approx(3.0)


def test_missing_feature_everywhere_is_neutral():
    c = cfg(weights={"lst_c": 1.0, "ndvi": -1.0})
    s = score_wards({1: {"lst_c": 30.0}, 2: {"lst_c": 32.0, "ndvi": None}}, c)
    assert s[1].z["ndvi"] == 0.0 and s[2].z["ndvi"] == 0.0
    assert s[2].score == pytest.approx(0.5)  # (1 * 1 + -1 * 0) / 2


def test_missing_value_for_one_ward_scores_it_average():
    c = cfg(weights={"lst_c": 1.0})
    s = score_wards({1: {"lst_c": 30.0}, 2: {"lst_c": None}, 3: {"lst_c": 34.0}}, c)
    assert s[2].score == 0.0
    assert s[2].level == "yellow"


def test_zero_weight_features_are_ignored():
    c = cfg(weights={"lst_c": 1.0, "ndbi": 0.0})
    s = score_wards({1: {"lst_c": 1.0, "ndbi": 9.0}, 2: {"lst_c": 2.0, "ndbi": -9.0}}, c)
    assert "ndbi" not in s[1].z


def test_all_identical_wards_are_yellow_in_both_modes():
    feats = {i: {"lst_c": 30.0} for i in range(5)}
    for mode in ("thresholds", "percentiles"):
        s = score_wards(feats, cfg(level_mode=mode))
        assert {v.level for v in s.values()} == {"yellow"}


def test_percentile_mode_distribution():
    feats = {i: {"lst_c": float(i)} for i in range(20)}
    s = score_wards(feats, cfg(level_mode="percentiles"))
    levels = [s[i].level for i in range(20)]
    assert levels.count("green") == 10
    assert levels.count("yellow") == 5
    assert levels.count("orange") == 3
    assert levels.count("red") == 2
    assert levels[-1] == "red" and levels[0] == "green"


def test_empty_input():
    assert score_wards({}, cfg()) == {}


# --- config ---------------------------------------------------------------------------------


def test_bundled_weights_yaml_is_valid_and_documents_signs():
    c = load_config(DEFAULT_WEIGHTS)
    assert set(c.weights) == set(FEATURES)
    assert c.weights["ndvi"] < 0
    for name in ("ndwi", "ndbi", "lst_c", "rain_14d_mm", "report_density", "cases_area"):
        assert c.weights[name] > 0, name
    assert c.level_mode == "thresholds"
    assert c.thresholds == (-0.5, 0.25, 1.0)
    assert c.version


def test_config_from_dict_percentiles():
    c = config_from_dict(
        {
            "version": "x",
            "weights": {"ndvi": -1},
            "z_clip": None,
            "levels": {
                "mode": "percentiles",
                "percentiles": {"yellow": 0.4, "orange": 0.7, "red": 0.95},
            },
        }
    )
    assert c.percentiles == (0.4, 0.7, 0.95) and c.z_clip is None


@pytest.mark.parametrize(
    "bad",
    [
        {"weights": {"bogus": 1.0}},
        {"weights": {"ndvi": 0.0}},
        {"level_mode": "quantum"},
        {"thresholds": (1.0, 0.5, 2.0)},
        {"percentiles": (0.5, 0.75, 1.0)},
        {"z_clip": 0.0},
    ],
)
def test_config_validation(bad):
    with pytest.raises(ValueError):
        cfg(**bad)


def test_config_missing_level_key():
    with pytest.raises(ValueError, match="red"):
        config_from_dict(
            {"version": "x", "weights": {"ndvi": -1},
             "levels": {"thresholds": {"yellow": 0, "orange": 1}}}
        )  # fmt: skip
