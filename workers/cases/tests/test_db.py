"""Upsert test against a real Postgres. Skipped unless DATABASE_URL is set.

Uses a TEMP table named case_counts, which shadows any real table for this session only,
so it is safe to point at a dev database.
"""

import datetime as dt
import os
import uuid

import pytest

from cases.models import CaseCount

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set")


@pytest.fixture
def conn():
    from cases.db import connect

    with connect() as c:
        c.execute(
            """
            CREATE TEMP TABLE case_counts (
                date date NOT NULL,
                area text NOT NULL,
                admissions int NOT NULL,
                deaths int NOT NULL,
                source_url text,
                entered_by uuid,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (date, area)
            ) ON COMMIT PRESERVE ROWS
            """
        )
        yield c


def test_upsert_is_idempotent_and_respects_manual_rows(conn):
    from cases.db import upsert_case_counts

    day = dt.date(2026, 9, 29)
    manual = uuid.uuid4()
    conn.execute(
        "INSERT INTO case_counts (date, area, admissions, deaths, source_url, entered_by) "
        "VALUES (%s, 'DSCC', 999, 9, 'manual', %s)",
        (day, manual),
    )
    rows = [
        CaseCount(day, "DNCC", 120, 0, "https://a"),
        CaseCount(day, "DSCC", 150, 2, "https://a"),
    ]
    first = upsert_case_counts(conn, rows)
    assert (first.written, first.skipped_manual) == (1, 1)

    again = upsert_case_counts(conn, [CaseCount(day, "DNCC", 121, 1, "https://b")])
    assert again.written == 1
    rows_now = conn.execute(
        "SELECT area, admissions, deaths, source_url FROM case_counts"
    ).fetchall()
    got = {area: (adm, dth, url) for area, adm, dth, url in rows_now}
    assert got["DNCC"] == (121, 1, "https://b")
    assert got["DSCC"] == (999, 9, "manual")  # manual entry wins
