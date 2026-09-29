import datetime as dt

import pytest

from cases.parse import (
    area_from_label,
    cell_int,
    find_areas,
    find_date,
    normalize_text,
    parse_html,
    parse_tables,
    parse_text,
    to_int,
)

EXPECTED_ADMISSIONS = {
    "DNCC": 120,
    "DSCC": 150,
    "DHAKA_DIV": 231,
    "CHATTOGRAM_DIV": 98,
    "KHULNA_DIV": 70,
    "RAJSHAHI_DIV": 50,
    "RANGPUR_DIV": 10,
    "MYMENSINGH_DIV": 40,
    "BARISHAL_DIV": 110,
    "SYLHET_DIV": 3,
}
EXPECTED_DEATHS = {"DSCC": 2, "BARISHAL_DIV": 1}
DAY = dt.date(2026, 9, 29)


def _nonzero(d: dict[str, int]) -> dict[str, int]:
    return {k: v for k, v in d.items() if v}


# --- helpers -------------------------------------------------------------------------------


def test_bangla_digits_and_commas():
    assert normalize_text("৭৭,৬৭২") == "77,672"
    assert to_int("৭৭,৬৭২") == 77672
    assert to_int("three") == 3
    assert cell_int("—") == 0
    assert cell_int("১২০") == 120
    assert cell_int("n/a") is None


@pytest.mark.parametrize(
    ("label", "code"),
    [
        ("Dhaka North City Corporation", "DNCC"),
        ("DNCC", "DNCC"),
        ("ঢাকা উত্তর সিটি কর্পোরেশন", "DNCC"),
        ("ঢাকা উত্তর সিটি করপোরেশন", "DNCC"),
        ("ঢাকা দক্ষিণ সিটি কর্পোরেশন", "DSCC"),
        ("Dhaka South", "DSCC"),
        ("Dhaka division (excluding city corporations)", "DHAKA_DIV"),
        ("Dhaka (outside city corporations)", "DHAKA_DIV"),
        ("ঢাকা বিভাগ (সিটি কর্পোরেশন ব্যতীত)", "DHAKA_DIV"),
        ("ঢাকা", "DHAKA_DIV"),
        ("Chittagong", "CHATTOGRAM_DIV"),
        ("চট্টগ্রাম বিভাগ", "CHATTOGRAM_DIV"),
        ("Barisal", "BARISHAL_DIV"),
        ("বরিশাল", "BARISHAL_DIV"),
        ("ময়মনসিংহ বিভাগ", "MYMENSINGH_DIV"),
        ("রংপুর", "RANGPUR_DIV"),
        ("রাজশাহী", "RAJSHAHI_DIV"),
        ("খুলনা", "KHULNA_DIV"),
        ("সিলেট", "SYLHET_DIV"),
        ("Total", "BANGLADESH"),
        ("সর্বমোট", "BANGLADESH"),
        ("Dhaka City", None),
        ("Remarks", None),
    ],
)
def test_area_from_label(label, code):
    assert area_from_label(label) == code


def test_bangla_decomposed_nukta_matches():
    # "য়" typed as য + nukta (U+09AF U+09BC) must match the precomposed spelling.
    decomposed = "ময়মনসিংহ বিভাগ"
    assert [a.code for a in find_areas(normalize_text(decomposed))] == ["MYMENSINGH_DIV"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Date: 29 September 2026", DAY),
        ("Dhaka, Sept 29, 2026 (bdnews24.com)", DAY),
        ("তারিখ: ২৯ সেপ্টেম্বর ২০২৬", DAY),
        ("Report date: 29/09/2026", DAY),
        ("2026-09-29", DAY),
        ("no date here", None),
    ],
)
def test_find_date(text, expected):
    assert find_date(normalize_text(text)) == expected


# --- full documents ------------------------------------------------------------------------


def test_english_dghs_press_release(read_fixture):
    b = parse_text(read_fixture("en_dghs_press_release.txt"))
    assert b.date == DAY
    assert b.admissions == EXPECTED_ADMISSIONS
    assert _nonzero(b.deaths) == EXPECTED_DEATHS
    assert b.total_admissions == 882
    assert b.total_deaths == 3
    assert b.warnings() == []


def test_bangla_dghs_press_release(read_fixture):
    b = parse_text(read_fixture("bn_dghs_press_release.txt"))
    assert b.date == DAY
    assert b.admissions == EXPECTED_ADMISSIONS
    assert _nonzero(b.deaths) == EXPECTED_DEATHS
    assert b.total_admissions == 882
    assert b.total_deaths == 3


def test_english_news_article(read_fixture):
    b = parse_html(read_fixture("en_news_article.html"))
    assert b.date == DAY  # from article:published_time
    assert b.admissions == EXPECTED_ADMISSIONS
    assert _nonzero(b.deaths) == EXPECTED_DEATHS
    assert b.total_admissions == 882
    assert b.total_deaths == 3


def test_bangla_news_article(read_fixture):
    b = parse_html(read_fixture("bn_news_article.html"))
    assert b.date == DAY  # 09:05Z == 15:05 Asia/Dhaka
    assert b.admissions == EXPECTED_ADMISSIONS
    assert _nonzero(b.deaths) == EXPECTED_DEATHS
    assert b.total_admissions == 882
    assert b.total_deaths == 3


def test_table_with_rowspan_and_cumulative_columns(read_fixture):
    html = read_fixture("dghs_table.html")
    b = parse_tables(html)
    assert b.admissions == EXPECTED_ADMISSIONS
    assert _nonzero(b.deaths) == EXPECTED_DEATHS
    assert b.total_admissions == 882
    assert b.total_deaths == 3
    assert parse_html(html).date == DAY


def test_no_figures(read_fixture):
    b = parse_html(read_fixture("no_figures.html"))
    assert b.empty
    assert b.to_case_counts(DAY, "x") == []


def test_to_case_counts_includes_national_total(read_fixture):
    b = parse_text(read_fixture("en_dghs_press_release.txt"))
    rows = {r.area: r for r in b.to_case_counts(DAY, "https://example.org/pr")}
    assert len(rows) == 11
    assert rows["BANGLADESH"].admissions == 882
    assert rows["BANGLADESH"].deaths == 3
    assert rows["DNCC"].deaths == 0
    assert rows["DSCC"].deaths == 2
    assert all(r.date == DAY and r.source_url == "https://example.org/pr" for r in rows.values())


def test_total_derived_from_complete_regions():
    text = (
        "In the last 24 hours, the following dengue patients were admitted: "
        "Dhaka North City Corporation 1, Dhaka South City Corporation 2, Dhaka division 3, "
        "Chattogram division 4, Khulna division 5, Rajshahi division 6, Rangpur division 7, "
        "Mymensingh division 8, Barishal division 9, Sylhet division 10. No deaths were reported."
    )
    b = parse_text(text)
    rows = {r.area: r for r in b.to_case_counts(DAY, "x")}
    assert rows["BANGLADESH"].admissions == 55
    assert rows["BANGLADESH"].deaths == 0


def test_number_before_area_with_and():
    b = parse_text(
        "During the period 12 patients were admitted in Dhaka North and 7 in Dhaka South."
    )
    assert b.admissions == {"DNCC": 12, "DSCC": 7}


def test_number_after_area_with_and():
    b = parse_text("New admissions: Dhaka North City Corporation 12 and Dhaka South City 7.")
    assert b.admissions == {"DNCC": 12, "DSCC": 7}


def test_colon_list_on_separate_lines():
    text = (
        "Hospital admissions in last 24 hours\nDNCC: 45\nDSCC: 61\nDeaths in last 24 hours\nDSCC: 1"
    )
    b = parse_text(text)
    assert b.admissions == {"DNCC": 45, "DSCC": 61}
    assert b.deaths == {"DSCC": 1}


def test_cumulative_sentences_are_ignored():
    b = parse_text(
        "So far this year, Dhaka South City Corporation recorded 18,450 admissions and 95 deaths."
    )
    assert b.empty
    assert b.deaths == {}


def test_warns_when_dncc_dscc_missing():
    b = parse_text("In the last 24 hours, 30 patients were admitted in Khulna division.")
    assert b.admissions == {"KHULNA_DIV": 30}
    assert any("DNCC" in w for w in b.warnings())
