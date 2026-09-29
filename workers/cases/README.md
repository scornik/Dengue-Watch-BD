# cases worker (M6): DGHS daily dengue figures

This worker fetches the daily dengue press release from DGHS, or from a newspaper that
republishes it. It parses hospital admissions and deaths for the previous 24 hours by area
and upserts them into `case_counts`.

```
python -m cases.main [--date YYYY-MM-DD] [--dry-run] [--from-file PATH] [--source-url URL] [-v]
```

| Exit code | Meaning |
| --- | --- |
| 0 | Rows parsed (and written, unless `--dry-run`) |
| 2 | No source produced figures. The job fails so Northflank flags it, and admins use the manual entry form |
| 3 | Database error |
| 4 | Bad configuration, for example `DATABASE_URL` missing without `--dry-run` |

## How it works

- `cases/sources.py` holds a pluggable list of sources, tried in order. Each entry has the form
  `[kind:]url`:
  - `page:` (the default): the URL is the bulletin itself, as HTML, text or a PDF.
  - `list:`: the URL is a listing or topic page. The worker follows the newest links whose text
    looks like a daily dengue update, in English or Bangla, up to `CASES_MAX_LINKS`.

  New kinds are added in `FETCHERS`. **The default URLs are best-effort and change often.**
  Check them before deploying and override them with `CASES_SOURCE_URLS`.
- `cases/parse.py`:
  - **HTML tables:** handles `rowspan`/`colspan`. It picks the "last 24 hours" admitted and
    death columns and ignores cumulative columns ("total since 1 January", "মোট", discharged,
    under treatment). A dash cell counts as 0.
  - **Press-release text:** handles English and Bangla. Bangla digits (০-৯) and thousands
    separators are converted, and Unicode is NFC-normalised, so both spellings of য়/ড় match.
    Area names are matched in English, including old spellings (Chittagong, Barisal), and in
    Bangla (ঢাকা উত্তর/দক্ষিণ সিটি কর্পোরেশন/করপোরেশন, ঢাকা বিভাগ, চট্টগ্রাম বিভাগ …). It
    handles both "Area N" and "N in Area" orderings and picks whichever explains more areas in
    each sentence.
  - **Sentence context:** each sentence is classified as admissions, deaths or cumulative. A
    sentence with no keyword inherits the previous sentence's context. Figures for this year,
    this month or so far are ignored.
  - **National total (`BANGLADESH`):** taken from the release when stated. Otherwise it is
    derived only when all 10 regional areas are present.
  - **Date:** the article's publish metadata is used first (converted to Asia/Dhaka), then the
    first date in the text. A document with no date is **skipped**, unless you pass `--date`.
    With `--date`, a bulletin dated differently is skipped as stale.
- `cases/db.py` runs one transaction that does
  `INSERT … ON CONFLICT (date, area) DO UPDATE … WHERE case_counts.entered_by IS NULL`, so a
  manual admin entry always wins. Re-running the job is harmless.

`date` means the bulletin date, which covers the 24 hours ending 08:00 Asia/Dhaka on that
day. Area codes: `DNCC, DSCC, DHAKA_DIV` (Dhaka division outside the city corporations),
`CHATTOGRAM_DIV, KHULNA_DIV, RAJSHAHI_DIV, RANGPUR_DIV, MYMENSINGH_DIV, BARISHAL_DIV,
SYLHET_DIV, BANGLADESH`.

Limitations:

- Scanned or image-only bulletins cannot be parsed.
- PDFs that use legacy Bijoy/SutonnyMJ fonts cannot be parsed.
- Any change in wording can break the parser.

That is why the job fails loudly and the manual form exists.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes, unless `--dry-run` | none | Postgres connection string (Supabase) |
| `CASES_SOURCE_URLS` | no | DGHS HEOC dengue page, bdnews24 topic, Daily Star tag (all `list:`) | Comma-separated `[kind:]url` sources |
| `CASES_MAX_LINKS` | no | `3` | Article links followed per `list:` source |
| `CASES_HTTP_TIMEOUT` | no | `30` | HTTP timeout in seconds |
| `LOG_LEVEL` | no | `INFO` | Python log level |

## Schedule (Northflank cron)

The schedule is `0 4 * * *` UTC, which is 10:00 Asia/Dhaka (UTC+6, no DST). The command is
`python -m cases.main`. See `northflank.json`.

DGHS often publishes the press release in the afternoon. At 10:00 the newest dated bulletin
may still be yesterday's, which is then (re)upserted idempotently. If you want same-day
figures, add a second run, for example `0 12 * * *` (18:00 Dhaka).

## Development

```
uv run --extra dev pytest          # DB test is skipped unless DATABASE_URL is set
uv run --extra dev ruff check . && uv run --extra dev ruff format --check .
uv run python -m cases.main --dry-run --from-file tests/fixtures/bn_dghs_press_release.txt
```

The DB test creates a `TEMP` table named `case_counts`. It shadows the real table for that
session only, so it is safe to run against a dev database.

Docker (build context `workers/cases`): `docker build -t denguewatch-cases workers/cases`.
The image runs as the non-root user `app` and contains no secrets.
