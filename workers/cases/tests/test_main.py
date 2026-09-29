import datetime as dt
import json

from cases import main as cli
from cases.sources import Document


def test_dry_run_from_file(fixture_path, capsys):
    rc = cli.main(["--dry-run", "--from-file", str(fixture_path("bn_dghs_press_release.txt"))])
    assert rc == 0
    rows = json.loads(capsys.readouterr().out)
    by_area = {r["area"]: r for r in rows}
    assert by_area["DNCC"] == {
        "date": "2026-09-29",
        "area": "DNCC",
        "admissions": 120,
        "deaths": 0,
        "source_url": by_area["DNCC"]["source_url"],
    }
    assert by_area["BANGLADESH"]["admissions"] == 882


def test_fails_loudly_when_nothing_parsed(fixture_path):
    rc = cli.main(["--dry-run", "--from-file", str(fixture_path("no_figures.html"))])
    assert rc == cli.EXIT_NO_DATA


def test_requires_database_url_without_dry_run(fixture_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    rc = cli.main(["--from-file", str(fixture_path("en_dghs_press_release.txt"))])
    assert rc == cli.EXIT_USAGE


def test_extract_skips_stale_bulletin_and_undated(read_fixture):
    dated = Document("https://x/1", read_fixture("en_dghs_press_release.txt"), is_html=False)
    undated = Document("https://x/2", "Dhaka North City Corporation 5 patients admitted", False)
    # Wrong date requested -> dated doc skipped; undated doc gets the requested date.
    rows = cli.extract([dated, undated], dt.date(2026, 9, 30))
    assert [(r.area, r.admissions, r.source_url) for r in rows] == [("DNCC", 5, "https://x/2")]
    # No --date: the undated doc is rejected rather than guessed.
    assert cli.extract([undated], None) == []
