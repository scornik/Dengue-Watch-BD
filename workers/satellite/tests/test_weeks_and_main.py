import datetime as dt

import pytest

from satellite import main as cli
from satellite.db import Ward
from satellite.score import ScoreConfig, score_wards
from satellite.weeks import DHAKA_TZ, current_week, parse_week, week_start_ts


def test_week_helpers():
    assert parse_week("2026-10-01") == dt.date(2026, 9, 28)  # Thursday -> Monday
    assert parse_week("2026-W40") == dt.date(2026, 9, 28)
    # Cron fires Sunday 21:00 UTC = Monday 03:00 Asia/Dhaka -> that Monday.
    fire = dt.datetime(2026, 9, 27, 21, 0, tzinfo=dt.UTC)
    assert current_week(fire) == dt.date(2026, 9, 28)
    ts = week_start_ts(dt.date(2026, 9, 28))
    assert ts.tzinfo == DHAKA_TZ and ts.astimezone(dt.UTC).hour == 18


def _ward(i, cc, x0):
    geom = {"type": "MultiPolygon",
            "coordinates": [[[[x0, 23.7], [x0 + 0.01, 23.7], [x0 + 0.01, 23.71], [x0, 23.71],
                              [x0, 23.7]]]]}  # fmt: skip
    return Ward(i, cc, geom, 1.2, 23.705, x0 + 0.005)


def test_bbox_assemble_and_rows():
    wards = [_ward(1, "DNCC", 90.40), _ward(2, "DSCC", 90.42)]
    assert cli.bbox_for(wards, pad=0.0) == pytest.approx((90.40, 23.7, 90.43, 23.71))
    feats = cli.assemble_features(
        wards,
        s2={1: {"ndvi": 0.3, "ndwi": -0.1, "ndbi": float("nan")}},
        lst={1: 31.0, 2: 33.0},
        rain={1: 80.0, 2: 90.0},
        density={1: 0.0, 2: 2.5},
        city_cases={"DSCC": 700.0},
    )
    assert feats[1]["ndbi"] is None  # NaN cleaned
    assert feats[2]["ndvi"] is None
    assert feats[1]["cases_area"] is None and feats[2]["cases_area"] == 700.0
    c = ScoreConfig(version="t", weights={"lst_c": 1.0, "report_density": 1.0})
    rows = cli.build_rows(feats, score_wards(feats, c), dt.date(2026, 9, 28), "t")
    assert [r["ward_id"] for r in rows] == [1, 2]
    assert rows[1]["level"] == "red" and rows[1]["score"] == 1.0  # (1 + 1) / 2
    assert set(rows[0]) == {
        "ward_id", "week", "ndvi", "ndwi", "ndbi", "lst_c", "rain_14d_mm", "report_density",
        "cases_area", "score", "level", "method_version",
    }  # fmt: skip


def test_main_requires_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert cli.main(["--dry-run"]) == cli.EXIT_USAGE


def test_main_rejects_bad_weights(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused")
    bad = tmp_path / "w.yaml"
    bad.write_text("version: x\nweights: {bogus: 1}\n")
    assert cli.main(["--dry-run", "--weights", str(bad)]) == cli.EXIT_USAGE
