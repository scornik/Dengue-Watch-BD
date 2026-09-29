"""CLI: compute the weekly ward environmental risk and upsert it into `ward_risk`.

    python -m satellite.main [--week YYYY-MM-DD|YYYY-Www] [--dry-run]
                             [--skip-imagery] [--skip-weather] [--weights PATH] [-v]

Exit codes: 0 ok, 2 no wards with geometry, 3 database error, 4 bad configuration.
Imagery/STAC network errors propagate (non-zero exit) so Northflank marks the run failed;
"no cloud-free scenes" is not an error - those features are recorded as NULL and scored neutral.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import math
import os
import sys
from collections.abc import Mapping, Sequence
from typing import Any

from .config import Settings
from .db import Ward
from .score import FEATURES, ScoreConfig, WardScore, load_config, score_wards
from .weeks import current_week, parse_week

log = logging.getLogger("satellite")

EXIT_OK, EXIT_NO_WARDS, EXIT_DB, EXIT_USAGE = 0, 2, 3, 4

Features = dict[int, dict[str, float | None]]


def bbox_for(wards: Sequence[Ward], pad: float = 0.01) -> tuple[float, float, float, float]:
    from rasterio.features import bounds

    bs = [bounds(w.geom) for w in wards]
    return (
        min(b[0] for b in bs) - pad,
        min(b[1] for b in bs) - pad,
        max(b[2] for b in bs) + pad,
        max(b[3] for b in bs) + pad,
    )


def _clean(v: float | None) -> float | None:
    return None if v is None or not math.isfinite(v) else float(v)


def assemble_features(
    wards: Sequence[Ward],
    *,
    s2: Mapping[int, Mapping[str, float | None]],
    lst: Mapping[int, float | None],
    rain: Mapping[int, float | None],
    density: Mapping[int, float | None],
    city_cases: Mapping[str, float],
) -> Features:
    out: Features = {}
    for w in wards:
        idx = s2.get(w.id, {})
        out[w.id] = {
            "ndvi": _clean(idx.get("ndvi")),
            "ndwi": _clean(idx.get("ndwi")),
            "ndbi": _clean(idx.get("ndbi")),
            "lst_c": _clean(lst.get(w.id)),
            "rain_14d_mm": _clean(rain.get(w.id)),
            "report_density": _clean(density.get(w.id)),
            "cases_area": _clean(city_cases.get(w.city_corp)),
        }
    return out


def build_rows(
    features: Features, scores: Mapping[int, WardScore], week: dt.date, version: str
) -> list[dict[str, Any]]:
    rows = []
    for ward_id, feats in features.items():
        sc = scores[ward_id]
        rows.append(
            {
                "ward_id": ward_id,
                "week": week,
                **{name: feats.get(name) for name in FEATURES},
                "score": round(sc.score, 4),
                "level": sc.level,
                "method_version": version,
            }
        )
    return rows


def compute_features(
    conn: Any, wards: Sequence[Ward], week: dt.date, s: Settings, args: argparse.Namespace
) -> Features:
    from .db import fetch_city_cases, fetch_report_density

    geoms = {w.id: w.geom for w in wards}
    s2: Mapping[int, Mapping[str, float | None]] = {}
    lst: Mapping[int, float | None] = {}
    if not args.skip_imagery:
        from .imagery import landsat_ward_lst, open_catalog, sentinel2_ward_indices

        catalog = open_catalog(s.stac_url)
        bbox = bbox_for(wards)
        start = week - dt.timedelta(days=s.lookback_days)
        s2 = sentinel2_ward_indices(catalog, geoms, bbox, start, week, s)
        lst = landsat_ward_lst(catalog, geoms, bbox, start, week, s)
        if not s2:
            log.warning("no usable Sentinel-2 scenes; NDVI/MNDWI/NDBI will be NULL")
        if not lst:
            log.warning("no usable Landsat scenes; LST will be NULL")

    rain: Mapping[int, float | None] = {}
    if not args.skip_weather:
        import httpx

        from .weather import ward_rainfall

        with httpx.Client(timeout=s.http_timeout) as client:
            rain = ward_rainfall(
                client,
                {w.id: (w.lat, w.lon) for w in wards},
                week - dt.timedelta(days=s.rain_days),
                week - dt.timedelta(days=1),
                fallback=(s.city_lat, s.city_lon),
                forecast_url=s.open_meteo_forecast_url,
                archive_url=s.open_meteo_archive_url,
            )

    density = fetch_report_density(conn, week, s.report_window_days)
    city_cases = fetch_city_cases(conn, week, s.case_window_days)
    return assemble_features(
        wards, s2=s2, lst=lst, rain=rain, density=density, city_cases=city_cases
    )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m satellite.main", description=__doc__.split("\n")[0])
    p.add_argument("--week", type=parse_week, help="week (any date in it, or YYYY-Www)")
    p.add_argument("--dry-run", action="store_true", help="print rows as JSON; no DB writes")
    p.add_argument("--skip-imagery", action="store_true", help="skip STAC (debugging)")
    p.add_argument("--skip-weather", action="store_true", help="skip Open-Meteo (debugging)")
    p.add_argument("--weights", help="weights.yaml path (default: WEIGHTS_PATH or bundled)")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    s = Settings.from_env()
    try:
        cfg: ScoreConfig = load_config(args.weights or s.weights_path)
    except (OSError, ValueError, KeyError) as exc:
        log.error("invalid weights config: %s", exc)
        return EXIT_USAGE
    if not s.database_url:
        log.error("DATABASE_URL is not set (needed to read wards, even for --dry-run)")
        return EXIT_USAGE
    week = args.week or current_week()
    log.info("computing ward risk for week %s (method %s)", week, cfg.version)

    from .db import connect, fetch_wards, upsert_ward_risk

    with connect(s.database_url) as conn:
        wards = fetch_wards(conn)
        if not wards:
            log.error("no wards with geometry; load ward boundaries first")
            return EXIT_NO_WARDS
        log.info("%d wards with geometry", len(wards))
        features = compute_features(conn, wards, week, s, args)
        scores = score_wards(features, cfg)
        rows = build_rows(features, scores, week, cfg.version)

        counts = {
            lvl: sum(r["level"] == lvl for r in rows)
            for lvl in ("green", "yellow", "orange", "red")
        }
        log.info("levels: %s", counts)
        if args.dry_run:
            json.dump(rows, sys.stdout, default=str, indent=2)
            sys.stdout.write("\n")
            return EXIT_OK
        try:
            n = upsert_ward_risk(conn, rows)
        except Exception:
            log.exception("upsert into ward_risk failed")
            return EXIT_DB
    log.info("upserted %d ward_risk rows for %s", n, week)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
