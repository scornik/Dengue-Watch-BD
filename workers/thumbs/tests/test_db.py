"""Claim/update loop against a real Postgres; skipped unless DATABASE_URL is set.

Uses a throwaway schema (dropped afterwards) because the SKIP LOCKED test needs two sessions.
"""

import os
import uuid

import pytest

from thumbs.worker import Outcome, run_batch

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set")


@pytest.fixture
def schema():
    import psycopg

    name = f"thumbs_test_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as admin:
        admin.execute(f"CREATE SCHEMA {name}")
        admin.execute(f"CREATE TYPE {name}.thumb_status AS ENUM ('pending','ok','failed')")
        admin.execute(
            f"""CREATE TABLE {name}.reports (
                  id uuid PRIMARY KEY, photo_path text, thumb_public_path text,
                  thumb_status {name}.thumb_status NOT NULL DEFAULT 'pending',
                  ai_label text, created_at timestamptz NOT NULL)"""
        )
        ids = [uuid.UUID(int=i + 1) for i in range(5)]
        labels = ["likely", "unclear", "not_relevant", "likely", "likely"]
        for i, (rid, label) in enumerate(zip(ids, labels, strict=True)):
            admin.execute(
                f"INSERT INTO {name}.reports (id, photo_path, ai_label, created_at) "
                "VALUES (%s, %s, %s, now() + %s * interval '1 minute')",
                (rid, f"u/{i}.jpg", label, i),
            )
        try:
            yield name, [str(i) for i in ids]
        finally:
            admin.execute(f"DROP SCHEMA {name} CASCADE")


def _connect(schema_name):
    import psycopg

    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute(f"SET search_path TO {schema_name}, public")
    return conn


def test_run_batch_updates_rows_and_respects_filters(schema):
    name, ids = schema
    outcomes = {
        ids[0]: Outcome("ok", key=f"{ids[0]}.jpg"),
        ids[1]: Outcome("failed", error="detector"),
        ids[3]: Outcome("retry", error="storage 503"),
        ids[4]: Outcome("ok", key=f"{ids[4]}.jpg"),
    }
    seen = []

    def handler(rid, path):
        seen.append(rid)
        return outcomes[rid]

    with _connect(name) as conn:
        counts = run_batch(conn, 10, handler)
        rows = dict(
            (r[0], (r[1], r[2]))
            for r in conn.execute(
                "SELECT id::text, thumb_status::text, thumb_public_path FROM reports"
            )
        )
    assert seen == [ids[0], ids[1], ids[3], ids[4]]  # oldest first; not_relevant skipped
    assert counts == {"ok": 2, "failed": 1, "retry": 1}
    assert rows[ids[0]] == ("ok", f"{ids[0]}.jpg")
    assert rows[ids[1]] == ("failed", None)
    assert rows[ids[2]] == ("pending", None)  # not_relevant never published
    assert rows[ids[3]] == ("pending", None)  # retried next run


def test_skip_locked_between_parallel_runs(schema):
    name, ids = schema
    with _connect(name) as a, _connect(name) as b:
        seen_b = []

        def handler_a(rid, path):
            # While A holds the lock on its row, B must skip it and take the next one.
            run_batch(b, 1, lambda r, p: seen_b.append(r) or Outcome("ok", key="x"))
            return Outcome("ok", key=f"{rid}.jpg")

        run_batch(a, 1, handler_a)
    assert seen_b == [ids[1]]
