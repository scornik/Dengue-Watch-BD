"""Database access for the satellite job (psycopg 3, PostGIS)."""

from __future__ import annotations

import datetime as dt
import json
import os
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import psycopg

from .weeks import week_start_ts


@dataclass(frozen=True, slots=True)
class Ward:
    id: int
    city_corp: str
    geom: dict[str, Any]  # GeoJSON MultiPolygon, EPSG:4326
    area_km2: float
    lat: float  # point on surface (always inside the ward, unlike a centroid)
    lon: float


# Wards without geometry are skipped (the satellite job cannot place them).
WARDS_SQL = """
SELECT id,
       city_corp::text,
       ST_AsGeoJSON(geom)                          AS geojson,
       ST_Area(geom::geography) / 1e6              AS area_km2,
       ST_Y(ST_PointOnSurface(geom))               AS lat,
       ST_X(ST_PointOnSurface(geom))               AS lon
  FROM wards
 WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom)
 ORDER BY id
"""

# Citizen reports per km2 over [start, end), excluding AI-flagged "not_relevant" reports
# (NULL labels count). Uses reports.ward_id, or the point location when ward_id is unset.
REPORT_DENSITY_SQL = """
SELECT w.id,
       count(r.id)::float8 / NULLIF(ST_Area(w.geom::geography) / 1e6, 0) AS density
  FROM wards w
  LEFT JOIN reports r
    ON (r.ward_id = w.id OR (r.ward_id IS NULL AND ST_Intersects(w.geom, r.geom)))
   AND r.created_at >= %(start)s
   AND r.created_at <  %(end)s
   AND r.ai_label IS DISTINCT FROM 'not_relevant'
 WHERE w.geom IS NOT NULL
 GROUP BY w.id, w.geom
"""

# Sum of daily admissions per city corporation over [start, end).
CASES_SQL = """
SELECT area, sum(admissions)::float8
  FROM case_counts
 WHERE area IN ('DNCC', 'DSCC')
   AND date >= %(start)s AND date < %(end)s
 GROUP BY area
"""

UPSERT_SQL = """
INSERT INTO ward_risk (ward_id, week, ndvi, ndwi, ndbi, lst_c, rain_14d_mm, report_density,
                       cases_area, score, level, method_version, computed_at)
VALUES (%(ward_id)s, %(week)s, %(ndvi)s, %(ndwi)s, %(ndbi)s, %(lst_c)s, %(rain_14d_mm)s,
        %(report_density)s, %(cases_area)s, %(score)s, %(level)s, %(method_version)s, now())
ON CONFLICT (ward_id, week) DO UPDATE SET
    ndvi = EXCLUDED.ndvi,
    ndwi = EXCLUDED.ndwi,
    ndbi = EXCLUDED.ndbi,
    lst_c = EXCLUDED.lst_c,
    rain_14d_mm = EXCLUDED.rain_14d_mm,
    report_density = EXCLUDED.report_density,
    cases_area = EXCLUDED.cases_area,
    score = EXCLUDED.score,
    level = EXCLUDED.level,
    method_version = EXCLUDED.method_version,
    computed_at = now()
"""


def connect(dsn: str | None = None) -> psycopg.Connection:
    dsn = dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(dsn)


def fetch_wards(conn: psycopg.Connection) -> list[Ward]:
    rows = conn.execute(WARDS_SQL).fetchall()
    return [
        Ward(int(i), str(cc), json.loads(gj), float(area), float(lat), float(lon))
        for i, cc, gj, area, lat, lon in rows
    ]


def fetch_report_density(
    conn: psycopg.Connection, week: dt.date, days: int
) -> dict[int, float | None]:
    end = week_start_ts(week)
    start = end - dt.timedelta(days=days)
    rows = conn.execute(REPORT_DENSITY_SQL, {"start": start, "end": end}).fetchall()
    return {int(w): (None if d is None else float(d)) for w, d in rows}


def fetch_city_cases(conn: psycopg.Connection, week: dt.date, days: int) -> dict[str, float]:
    rows = conn.execute(
        CASES_SQL, {"start": week - dt.timedelta(days=days), "end": week}
    ).fetchall()
    return {str(area): float(total) for area, total in rows}


def upsert_ward_risk(conn: psycopg.Connection, rows: Iterable[dict[str, Any]]) -> int:
    n = 0
    with conn.transaction(), conn.cursor() as cur:
        for row in rows:
            cur.execute(UPSERT_SQL, row)
            n += 1
    return n
