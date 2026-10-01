"""Claim/update loop against a real Postgres; skipped unless DATABASE_URL is set.

Uses a throwaway schema (dropped afterwards) because the SKIP LOCKED test needs two sessions.
Its `reports` and `cleanups` tables mirror the columns the worker relies on, so these tests
run whether or not the real migrations are applied (the schema shadows `public`).
"""

import os
import uuid

import pytest

from thumbs.worker import CLEANUPS, Outcome, purge_rejected_cleanups, run_batch

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
        admin.execute(
            f"""CREATE TABLE {name}.cleanups (
                  id uuid PRIMARY KEY, site_id uuid, volunteer_id uuid,
                  status text NOT NULL
                    CHECK (status IN ('claimed','done','rejected','expired')),
                  after_photo_path text, thumb_public_path text,
                  thumb_status {name}.thumb_status NOT NULL DEFAULT 'pending',
                  done_at timestamptz)"""
        )
        rows = [  # (status, after_photo_path, thumb_status, minutes)
            ("done", "v/0.jpg", "pending", 3),
            ("done", "v/1.jpg", "pending", 1),
            ("claimed", "v/2.jpg", "pending", 0),  # not done yet
            ("done", None, "pending", 0),  # no photo
            ("done", "v/4.jpg", "ok", 0),  # already processed
            ("rejected", "v/5.jpg", "pending", 0),
            ("done", "v/6.jpg", "pending", 2),
        ]
        cids = [uuid.UUID(int=100 + i) for i in range(len(rows))]
        for cid, (status, path, ts, m) in zip(cids, rows, strict=True):
            admin.execute(
                f"INSERT INTO {name}.cleanups (id, status, after_photo_path, thumb_status, done_at)"
                " VALUES (%s, %s, %s, %s, now() + %s * interval '1 minute')",
                (cid, status, path, ts, m),
            )
        try:
            yield name, [str(i) for i in ids], [str(c) for c in cids]
        finally:
            admin.execute(f"DROP SCHEMA {name} CASCADE")


def _connect(schema_name):
    import psycopg

    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute(f"SET search_path TO {schema_name}, public")
    return conn


def test_run_batch_updates_rows_and_respects_filters(schema):
    name, ids, _ = schema
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
    name, ids, _ = schema
    with _connect(name) as a, _connect(name) as b:
        seen_b = []

        def handler_a(rid, path):
            # While A holds the lock on its row, B must skip it and take the next one.
            run_batch(b, 1, lambda r, p: seen_b.append(r) or Outcome("ok", key="x"))
            return Outcome("ok", key=f"{rid}.jpg")

        run_batch(a, 1, handler_a)
    assert seen_b == [ids[1]]


def test_cleanups_claim_filter_order_and_updates(schema):
    name, _, cids = schema
    outcomes = {
        cids[1]: Outcome("ok", key=CLEANUPS.key(cids[1])),
        cids[6]: Outcome("retry", error="storage 503"),
        cids[0]: Outcome("failed", error="detector"),
    }
    seen = []

    def handler(cid, path):
        seen.append((cid, path))
        return outcomes[cid]

    with _connect(name) as conn:
        counts = run_batch(conn, 10, handler, source=CLEANUPS)
        rows = dict(
            (r[0], (r[1], r[2]))
            for r in conn.execute(
                "SELECT id::text, thumb_status::text, thumb_public_path FROM cleanups"
            )
        )
    # Only done + pending + with a photo, ordered by done_at.
    assert seen == [(cids[1], "v/1.jpg"), (cids[6], "v/6.jpg"), (cids[0], "v/0.jpg")]
    assert counts == {"ok": 1, "failed": 1, "retry": 1}
    assert rows[cids[1]] == ("ok", f"c/{cids[1]}.jpg")
    assert rows[cids[0]] == ("failed", None)
    assert rows[cids[6]] == ("pending", None)
    assert rows[cids[2]] == rows[cids[3]] == rows[cids[5]] == ("pending", None)
    assert rows[cids[4]] == ("ok", None)


def test_cleanups_skip_locked_between_parallel_runs(schema):
    name, _, cids = schema
    with _connect(name) as a, _connect(name) as b:
        seen_b = []

        def handler_a(cid, path):
            run_batch(
                b, 1, lambda c, p: seen_b.append(c) or Outcome("ok", key="x"), source=CLEANUPS
            )
            return Outcome("ok", key=CLEANUPS.key(cid))

        run_batch(a, 1, handler_a, source=CLEANUPS)
    assert seen_b == [cids[6]]


def test_crash_mid_photo_leaves_row_failed_and_next_run_moves_on(schema):
    name, ids, _ = schema

    def crash(rid, path):
        raise MemoryError("OOM while decoding")

    with _connect(name) as conn, pytest.raises(MemoryError):
        run_batch(conn, 10, crash)
    with _connect(name) as conn:  # a fresh process: the poison row is not claimed again
        seen = []
        run_batch(conn, 1, lambda r, p: seen.append(r) or Outcome("ok", key=f"{r}.jpg"))
        status = dict(conn.execute("SELECT id::text, thumb_status::text FROM reports").fetchall())
    assert status[ids[0]] == "failed"
    assert seen == [ids[1]] and status[ids[1]] == "ok"


def test_purge_rejected_cleanups(schema):
    name, _, cids = schema
    with _connect(name) as conn:
        conn.execute(
            "UPDATE cleanups SET thumb_public_path = 'c/' || id || '.jpg', thumb_status = 'ok' "
            "WHERE id = ANY(%s::uuid[])",
            ([cids[4], cids[5]],),
        )
        deleted = []
        assert purge_rejected_cleanups(conn, deleted.append) == {"unpublished": 1}
        assert purge_rejected_cleanups(conn, deleted.append) == {}  # idempotent
        rows = dict(
            (r[0], r[1]) for r in conn.execute("SELECT id::text, thumb_public_path FROM cleanups")
        )
    assert deleted == [f"c/{cids[5]}.jpg"]  # only the rejected one
    assert rows[cids[5]] is None
    assert rows[cids[4]] == f"c/{cids[4]}.jpg"  # done + ok stays published
