"""CLI: fetch the latest DGHS dengue figures and upsert them into `case_counts`.

    python -m cases.main [--date YYYY-MM-DD] [--dry-run] [--from-file PATH]

Exit codes: 0 ok, 2 nothing could be parsed (admins should use the manual entry form),
3 database error, 4 bad arguments/configuration.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sys
from collections.abc import Iterable

from .models import CaseCount
from .parse import Bulletin, looks_like_html, parse_html, parse_text
from .sources import Document, iter_documents, load_file, make_client, sources_from_env

log = logging.getLogger("cases")

EXIT_OK, EXIT_NO_DATA, EXIT_DB, EXIT_USAGE = 0, 2, 3, 4


def parse_document(doc: Document) -> Bulletin:
    if doc.is_html or looks_like_html(doc.content):
        return parse_html(doc.content)
    return parse_text(doc.content)


def extract(docs: Iterable[Document], want_date: dt.date | None) -> list[CaseCount]:
    """Return rows from the first document that parses, honouring --date if given."""
    for doc in docs:
        try:
            bulletin = parse_document(doc)
        except Exception:  # a malformed page must not stop us trying the next source
            log.exception("parser crashed on %s", doc.url)
            continue
        if bulletin.empty:
            log.info("no figures found in %s", doc.url)
            continue
        date = bulletin.date
        if want_date is not None:
            if date is not None and date != want_date:
                log.info("skipping %s: bulletin is for %s, wanted %s", doc.url, date, want_date)
                continue
            date = want_date
        if date is None:
            log.warning("skipping %s: could not determine the bulletin date (use --date)", doc.url)
            continue
        for w in bulletin.warnings():
            log.warning("%s: %s", doc.url, w)
        rows = bulletin.to_case_counts(date, doc.url)
        if rows:
            log.info("parsed %d rows for %s from %s", len(rows), date, doc.url)
            return rows
    return []


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m cases.main", description=__doc__.split("\n")[0])
    p.add_argument("--date", type=dt.date.fromisoformat, help="bulletin date (YYYY-MM-DD)")
    p.add_argument("--dry-run", action="store_true", help="print rows as JSON, no DB writes")
    p.add_argument("--from-file", metavar="PATH", help="parse a saved HTML/text/PDF bulletin")
    p.add_argument("--source-url", help="source_url to record with --from-file")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not args.dry_run and not os.environ.get("DATABASE_URL"):
        log.error("DATABASE_URL is not set (use --dry-run to only print results)")
        return EXIT_USAGE

    if args.from_file:
        rows = extract([load_file(args.from_file, args.source_url)], args.date)
    else:
        max_links = int(os.environ.get("CASES_MAX_LINKS", "3"))
        timeout = float(os.environ.get("CASES_HTTP_TIMEOUT", "30"))
        with make_client(timeout) as client:
            rows = extract(iter_documents(client, sources_from_env(), max_links), args.date)

    if not rows:
        log.error("no dengue figures could be parsed from any source; use the manual entry form")
        return EXIT_NO_DATA

    if args.dry_run:
        json.dump([r.to_json() for r in rows], sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return EXIT_OK

    from .db import connect, upsert_case_counts

    try:
        with connect() as conn:
            res = upsert_case_counts(conn, rows)
    except Exception:
        log.exception("database upsert failed")
        return EXIT_DB
    log.info("upserted %d rows, kept %d manual entries", res.written, res.skipped_manual)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
