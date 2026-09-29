"""Idempotent upsert into `case_counts` (psycopg 3).

Rule: re-running for the same (date, area) updates the scraped figures, but a row entered by
an admin through the manual form (`entered_by IS NOT NULL`) is never overwritten.
"""

from __future__ import annotations

import os
from collections.abc import Iterable
from dataclasses import dataclass

import psycopg

from .models import CaseCount

UPSERT_SQL = """
INSERT INTO case_counts (date, area, admissions, deaths, source_url)
VALUES (%(date)s, %(area)s, %(admissions)s, %(deaths)s, %(source_url)s)
ON CONFLICT (date, area) DO UPDATE
   SET admissions = EXCLUDED.admissions,
       deaths     = EXCLUDED.deaths,
       source_url = EXCLUDED.source_url,
       updated_at = now()
 WHERE case_counts.entered_by IS NULL
"""


@dataclass(frozen=True, slots=True)
class UpsertResult:
    written: int  # inserted or updated
    skipped_manual: int  # protected manual entries


def connect(dsn: str | None = None) -> psycopg.Connection:
    dsn = dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(dsn)


def upsert_case_counts(conn: psycopg.Connection, rows: Iterable[CaseCount]) -> UpsertResult:
    """Upsert rows in one transaction; returns how many were written vs. protected."""
    written = skipped = 0
    with conn.transaction(), conn.cursor() as cur:
        for row in rows:
            cur.execute(
                UPSERT_SQL,
                {
                    "date": row.date,
                    "area": row.area,
                    "admissions": row.admissions,
                    "deaths": row.deaths,
                    "source_url": row.source_url,
                },
            )
            if cur.rowcount == 1:
                written += 1
            else:
                skipped += 1
    return UpsertResult(written, skipped)
