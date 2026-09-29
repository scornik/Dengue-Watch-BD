"""DB tests against a real Postgres; skipped unless DATABASE_URL is set.

All tables are TEMP tables that shadow the real ones for this session only, so pointing this
at a dev database is safe. The ward/report queries additionally need PostGIS.
"""

import datetime as dt
import os

import pytest

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set")


@pytest.fixture
def conn():
    from satellite.db import connect

    with connect() as c:
        yield c
        c.rollback()


def test_upsert_ward_risk_with_enum_level(conn):
    from satellite.db import upsert_ward_risk

    conn.execute("CREATE TYPE pg_temp.risk_level AS ENUM ('green','yellow','orange','red')")
    conn.execute(
        """
        CREATE TEMP TABLE ward_risk (
            ward_id int, week date, ndvi real, ndwi real, ndbi real, lst_c real,
            rain_14d_mm real, report_density real, cases_area real, score real,
            level pg_temp.risk_level, method_version text,
            computed_at timestamptz DEFAULT now(), PRIMARY KEY (ward_id, week))
        """
    )
    week = dt.date(2026, 9, 28)
    row = {
        "ward_id": 1, "week": week, "ndvi": 0.2, "ndwi": None, "ndbi": 0.1, "lst_c": 31.5,
        "rain_14d_mm": 80.0, "report_density": 0.5, "cases_area": 700.0, "score": 0.3,
        "level": "orange", "method_version": "t",
    }  # fmt: skip
    assert upsert_ward_risk(conn, [row]) == 1
    assert upsert_ward_risk(conn, [{**row, "score": 1.2, "level": "red"}]) == 1
    got = conn.execute("SELECT count(*), max(score), max(level::text) FROM ward_risk").fetchone()
    assert got[0] == 1 and got[1] == pytest.approx(1.2) and got[2] == "red"


def test_wards_density_and_cases_queries(conn):
    from satellite.db import fetch_city_cases, fetch_report_density, fetch_wards

    try:
        conn.execute("SELECT postgis_version()")
    except Exception:
        conn.rollback()
        pytest.skip("PostGIS not available")
    conn.execute(
        """
        CREATE TEMP TABLE wards (id int PRIMARY KEY, city_corp text, ward_no int,
            name_bn text, name_en text, geom geometry(MultiPolygon, 4326));
        CREATE TEMP TABLE reports (id uuid DEFAULT gen_random_uuid(), geom geometry(Point, 4326),
            ward_id int, created_at timestamptz, ai_label text);
        CREATE TEMP TABLE case_counts (date date, area text, admissions int, deaths int,
            PRIMARY KEY (date, area));
        INSERT INTO wards VALUES
          (1, 'DNCC', 1, 'ক', 'A', ST_Multi(ST_MakeEnvelope(90.40, 23.80, 90.41, 23.81, 4326))),
          (2, 'DSCC', 1, 'খ', 'B', ST_Multi(ST_MakeEnvelope(90.41, 23.70, 90.42, 23.71, 4326))),
          (3, 'DSCC', 2, 'গ', 'C', NULL);
        INSERT INTO reports (geom, ward_id, created_at, ai_label) VALUES
          (ST_Point(90.405, 23.805, 4326), 1, '2026-09-20 10:00+06', 'likely'),
          (ST_Point(90.405, 23.805, 4326), NULL, '2026-09-21 10:00+06', NULL),
          (ST_Point(90.405, 23.805, 4326), 1, '2026-09-22 10:00+06', 'not_relevant'),
          (ST_Point(90.405, 23.805, 4326), 1, '2026-09-28 00:30+06', 'likely');
        INSERT INTO case_counts VALUES
          ('2026-09-27', 'DNCC', 100, 0), ('2026-09-14', 'DNCC', 50, 0),
          ('2026-09-13', 'DNCC', 999, 0), ('2026-09-28', 'DNCC', 999, 0),
          ('2026-09-20', 'DSCC', 70, 1), ('2026-09-20', 'BANGLADESH', 5000, 3);
        """
    )
    wards = fetch_wards(conn)
    assert [w.id for w in wards] == [1, 2]  # ward 3 has no geometry
    assert 1.0 < wards[0].area_km2 < 1.3
    density = fetch_report_density(conn, dt.date(2026, 9, 28), 28)
    assert density[1] == pytest.approx(2 / wards[0].area_km2)  # excludes not_relevant + future
    assert density[2] == 0.0
    assert fetch_city_cases(conn, dt.date(2026, 9, 28), 14) == {"DNCC": 150.0, "DSCC": 70.0}
