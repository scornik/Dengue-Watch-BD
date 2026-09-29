"""Parsers for DGHS daily dengue figures.

Two input shapes are supported:

* HTML tables (DGHS dashboards / HEOC pages, some news pages) with one row per area and
  columns for "admitted in last 24 h" and "deaths in last 24 h".
* Free text of the daily press release, in English or Bangla, e.g.

      "In the last 24 hours, 812 dengue patients were admitted ... Among them,
       Dhaka North City Corporation 120, Dhaka South City Corporation 150, ..."
      "গত ২৪ ঘণ্টায় ... ঢাকা উত্তর সিটি কর্পোরেশনে ১২০ জন, ঢাকা দক্ষিণ সিটিতে ১৫০ জন ..."

The text parser is heuristic by design (formats drift); every heuristic is covered by fixture
tests. When it cannot find anything it returns an empty result and the CLI exits non-zero so
admins fall back to the manual entry form.
"""

from __future__ import annotations

import datetime as dt
import re
import unicodedata
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from bs4.element import Tag

from .models import REGIONAL_AREAS, CaseCount

DHAKA_TZ = ZoneInfo("Asia/Dhaka")

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def _rx(pattern: str, flags: int = re.IGNORECASE) -> re.Pattern[str]:
    # Bangla letters such as "য়" / "ড়" have two Unicode spellings; NFC both sides.
    return re.compile(_nfc(pattern), flags)


def normalize_text(text: str) -> str:
    """NFC-normalise, convert Bangla digits to ASCII and tidy whitespace (keeps newlines)."""
    text = _nfc(text).translate(_BN_DIGITS)
    text = text.replace(" ", " ").replace("​", "")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n[ \n]*", "\n", text)
    return text.strip()


def _drop_plain_parentheticals(text: str) -> str:
    """Remove "(excluding city corporations)"-style asides that sit between a name and a number.

    Parentheticals containing digits are kept (they may carry the figures themselves).
    """
    return re.sub(r"\([^()\d]*\)", " ", text)


# ---------------------------------------------------------------------------------------------
# Area names
# ---------------------------------------------------------------------------------------------

_DIV = r"(?:\s+div(?:ision|\.)?)"
_BN_CORP = r"(?:\s*সিটি(?:\s*কর্?পোরেশন)?)?"
_AREA_PATTERNS: dict[str, str] = {
    "DNCC": (
        r"dhaka\s+north(?:\s+city(?:\s+corporation|\s+corp\.?)?)?|\bdncc\b"
        rf"|ঢাকা\s*উত্তর{_BN_CORP}|ডিএনসিসি"
    ),
    "DSCC": (
        r"dhaka\s+south(?:\s+city(?:\s+corporation|\s+corp\.?)?)?|\bdscc\b"
        rf"|ঢাকা\s*দক্ষিণ{_BN_CORP}|ডিএসসিসি"
    ),
    # Plain "Dhaka" is too ambiguous in prose; tables handle it separately.
    "DHAKA_DIV": rf"\bdhaka{_DIV}|ঢাকা\s*বিভাগ",
    "CHATTOGRAM_DIV": rf"\b(?:chattogram|chittagong){_DIV}?|চট্টগ্রাম(?:\s*বিভাগ)?",
    "KHULNA_DIV": rf"\bkhulna{_DIV}?|খুলনা(?:\s*বিভাগ)?",
    "RAJSHAHI_DIV": rf"\brajshahi{_DIV}?|রাজশাহী(?:\s*বিভাগ)?",
    "RANGPUR_DIV": rf"\brangpur{_DIV}?|রংপুর(?:\s*বিভাগ)?",
    "MYMENSINGH_DIV": rf"\bmymensingh{_DIV}?|ময়মনসিংহ(?:\s*বিভাগ)?",
    "BARISHAL_DIV": rf"\bbarish?al{_DIV}?|বরিশাল(?:\s*বিভাগ)?",
    "SYLHET_DIV": rf"\bsylhet{_DIV}?|সিলেট(?:\s*বিভাগ)?",
}
_AREA_RX = _rx("|".join(f"(?P<{code}>{pat})" for code, pat in _AREA_PATTERNS.items()))

_TOTAL_LABEL_RX = _rx(
    r"^(?:grand\s+)?total\b|^all\s+bangladesh|^bangladesh$|^সর্বমোট|^মোট|^সারা\s*দেশ"
)


@dataclass(frozen=True, slots=True)
class AreaMention:
    code: str
    start: int
    end: int


def find_areas(text: str) -> list[AreaMention]:
    """All non-overlapping area-name mentions in normalised text, in order."""
    out: list[AreaMention] = []
    for m in _AREA_RX.finditer(text):
        code = m.lastgroup
        assert code is not None
        out.append(AreaMention(code, m.start(), m.end()))
    return out


def area_from_label(label: str) -> str | None:
    """Map a table row label (English or Bangla) to an area code, or None."""
    norm = normalize_text(_drop_plain_parentheticals(label)).strip(" :.-")
    if not norm:
        return None
    if _TOTAL_LABEL_RX.search(norm):
        return "BANGLADESH"
    mentions = find_areas(norm)
    if mentions:
        return mentions[0].code
    # Tables often list the Dhaka division row simply as "Dhaka" / "ঢাকা".
    if re.fullmatch(_nfc(r"(?i)dhaka|ঢাকা"), norm):
        return "DHAKA_DIV"
    return None


# ---------------------------------------------------------------------------------------------
# Numbers
# ---------------------------------------------------------------------------------------------

_WORD_NUMBERS = {
    "no": 0, "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19, "twenty": 20,
}  # fmt: skip
# "no" is only a number in totals ("no deaths"), never in area pairs.
_PAIR_WORDS = "|".join(w for w in _WORD_NUMBERS if w != "no")
_NUM = rf"(?:\d{{1,3}}(?:,\d{{3}})+(?!\d)|\d+|\b(?:{_PAIR_WORDS})\b)"
_NUM_RX = re.compile(_NUM, re.IGNORECASE)


def to_int(token: str) -> int:
    """Parse "1,234", "১২৩" or "three" into an int."""
    t = token.strip().translate(_BN_DIGITS).lower()
    if t in _WORD_NUMBERS:
        return _WORD_NUMBERS[t]
    return int(t.replace(",", ""))


def cell_int(cell: str) -> int | None:
    """Parse a table cell: dashes/"nil" mean zero, anything non-numeric means None."""
    t = normalize_text(cell).strip()
    if t in {"-", "–", "—", "nil", "Nil", "NIL", "শূন্য"}:
        return 0
    m = re.fullmatch(r"\d{1,3}(?:,\d{3})+|\d+", t)
    return int(m.group(0).replace(",", "")) if m else None


# ---------------------------------------------------------------------------------------------
# Sentence context (admissions vs deaths vs cumulative)
# ---------------------------------------------------------------------------------------------

_DEATH_KW = _rx(r"\bdied\b|\bdeaths?\b|\bfatalit|\bkilled\b|\bsuccumbed\b|মৃত|মারা|প্রাণহানি")
_ADMIT_KW = _rx(
    r"admitt|admission|hospitali[sz]|\bnew\s+(?:dengue\s+)?(?:patients|cases)\b"
    r"|\bof\s+the\s+new\b|\bpatients\b|ভর্তি|রোগী"
)
_WINDOW_24H = _rx(
    r"24\s*(?:hours?|hrs?)|during\s+(?:this|the\s+same|the)\s+period|same\s+period"
    r"|\byesterday\b|২৪\s*ঘণ্টা|24\s*ঘণ্টা|একই\s*সময়ে"
)
_CUMULATIVE_KW = _rx(
    r"this\s+year|so\s+far|since\s+january|year\s+to\s+date|in\s+total\s+this|cumulative"
    r"|\bthis\s+month\b|\bin\s+(?:january|february|march|april|may|june|july|august|september"
    r"|october|november|december)\b|চলতি\s*বছর|এ\s*বছর|এই\s*বছর|এ\s*পর্যন্ত|জানুয়ারি\s*থেকে"
    r"|চলতি\s*মাস"
)

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?।])\s+|\n+")

# Text allowed between an area name and a number that FOLLOWS it ("Dhaka North City
# Corporation 120", "ঢাকা উত্তর সিটিতে ভর্তি হয়েছেন ১২০ জন", "Barishal division: 110").
_AFTER_GAP = _rx(
    r"[ঀ-৿‌‍]{0,4}\s*"
    r"(?:(?:areas?|এলাকায়|এলাকার|এলাকা|was|were|is|are|had|has|recorded|reported|saw|with|"
    r"patients?|people|persons|জন|রোগী|মোট|ভর্তি|হয়েছেন|হয়েছে|মারা|গেছেন|মৃত্যু)\s*)*"
    r"[:：\-–—=]?\s*"
)
# Text allowed between a number and the area name that FOLLOWS it ("231 were in Dhaka
# division", "১২০ জন ঢাকা উত্তর সিটিতে"): short, no digits, no list separators.
_BEFORE_GAP = re.compile(r"[^\d,;।:()\n]{0,40}")


@dataclass
class _SentenceCtx:
    kind: str | None  # "admissions" | "deaths" | None (cumulative / unknown)


def _classify(sentence: str, first_area_pos: int | None, inherited: str | None) -> str | None:
    if _CUMULATIVE_KW.search(sentence) and not _WINDOW_24H.search(sentence):
        return None
    hits: list[tuple[int, str]] = [(m.start(), "deaths") for m in _DEATH_KW.finditer(sentence)]
    hits += [(m.start(), "admissions") for m in _ADMIT_KW.finditer(sentence)]
    if not hits:
        return inherited
    hits.sort()
    if first_area_pos is not None:
        before = [h for h in hits if h[0] < first_area_pos]
        if before:
            return before[-1][1]
    return hits[0][1]


def _pairs(sentence: str) -> dict[str, int]:
    """Pair area mentions with numbers, choosing the orientation that explains more areas."""
    areas = find_areas(sentence)
    if not areas:
        return {}
    nums = list(_NUM_RX.finditer(sentence))
    after: dict[str, int] = {}
    before: dict[str, int] = {}
    for i, a in enumerate(areas):
        nxt = areas[i + 1].start if i + 1 < len(areas) else len(sentence)
        prv = areas[i - 1].end if i > 0 else 0
        for n in nums:
            if a.end <= n.start() < nxt:
                if _AFTER_GAP.fullmatch(sentence[a.end : n.start()]):
                    after.setdefault(a.code, to_int(n.group(0)))
                break
        for n in reversed(nums):
            if prv <= n.start() and n.end() <= a.start:
                if _BEFORE_GAP.fullmatch(sentence[n.end() : a.start]):
                    before.setdefault(a.code, to_int(n.group(0)))
                break
    return after if len(after) >= len(before) else before


# ---------------------------------------------------------------------------------------------
# National totals
# ---------------------------------------------------------------------------------------------

_ADMIT_TOTAL_RXS = [
    _rx(
        rf"({_NUM})\s+(?:more\s+|new\s+)?(?:dengue\s+)?(?:patients?|people|persons|cases)\b"
        r"(?:\s+\S+){0,6}?\s+(?:admitted|hospitali[sz]ed)"
    ),
    _rx(
        rf"(?:admitted|hospitali[sz]ed)(?:\s+\S+){{0,8}}?\s+({_NUM})\s+(?:more\s+|new\s+)?"
        r"(?:dengue\s+)?(?:patients|people|persons)"
    ),
    _rx(rf"({_NUM})\s*জন(?:\s*\S+){{0,4}}?\s*ভর্তি"),
    _rx(rf"ভর্তি\s*হয়েছেন\s*(?:আরও\s*|আরো\s*)?({_NUM})\s*জন"),
]
_DEATH_TOTAL_RXS = [
    _rx(
        rf"({_NUM})\s+(?:more\s+)?(?:dengue\s+)?(?:patients?|people|persons|more)?"
        r"\s*(?:\S+\s+){0,3}?(?:have\s+|has\s+|had\s+)?died\b"
    ),
    _rx(rf"({_NUM})\s+(?:more\s+|new\s+)?(?:dengue\s+)?deaths?\b"),
    _rx(rf"deaths?\s+of\s+({_NUM})\b"),
    _rx(rf"({_NUM})\s*জনের\s*মৃত্যু"),
    _rx(rf"মৃত্যু\s*হয়েছে\s*(?:আরও\s*|আরো\s*)?({_NUM})\s*জনের"),
    _rx(rf"মারা\s*গেছেন\s*(?:আরও\s*|আরো\s*)?({_NUM})\s*জন"),
    _rx(rf"({_NUM})\s*জন\s*(?:\S+\s*){{0,2}}মারা"),
]
_NO_DEATHS_RX = _rx(
    r"\bno\s+(?:new\s+)?(?:dengue\s+)?deaths?\b|\bno\s+one\s+(?:has\s+)?died\b"
    r"|\bno\s+(?:dengue\s+)?(?:patient|death)s?\s+(?:was|were|has\s+been)\s+reported"
    r"|কারো\s*মৃত্যু\s*হয়নি|কোনো\s*মৃত্যু|মৃত্যুর\s*খবর\s*পাওয়া\s*যায়নি"
)


def _find_total(sentences: list[str], rxs: list[re.Pattern[str]]) -> int | None:
    for s in sentences:
        if _CUMULATIVE_KW.search(s) and not _WINDOW_24H.search(s):
            continue
        areas = find_areas(s)
        for rx in rxs:
            for m in rx.finditer(s):
                if not _attached_to_area(s, m.start(1), m.end(1), areas):
                    return to_int(m.group(1))
    return None


def _attached_to_area(s: str, start: int, end: int, areas: list[AreaMention]) -> bool:
    """True if the number at s[start:end] is an area's figure rather than a national total."""
    for a in areas:
        if a.end <= start and _AFTER_GAP.fullmatch(s[a.end : start]):
            return True
        if a.start >= end and _BEFORE_GAP.fullmatch(s[end : a.start]):
            return True
    return False


# ---------------------------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------------------------

_EN_MONTHS = {
    m: i
    for i, names in enumerate(
        [
            ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"),
            ("may",), ("jun", "june"), ("jul", "july"), ("aug", "august"),
            ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
            ("dec", "december"),
        ],
        start=1,
    )
    for m in names
}  # fmt: skip
_BN_MONTHS = {
    _nfc(m): i
    for i, m in enumerate(
        ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট",
         "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"],
        start=1,
    )
}  # fmt: skip
_EN_MON = "|".join(sorted(_EN_MONTHS, key=len, reverse=True))
_BN_MON = "|".join(sorted(_BN_MONTHS, key=len, reverse=True))
_DATE_RXS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b"), "ymd"),
    (_rx(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_EN_MON})\.?,?\s+(20\d\d)\b"), "d_mon_y"),
    (_rx(rf"\b({_EN_MON})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(20\d\d)\b"), "mon_d_y"),
    (_rx(rf"(\d{{1,2}})\s*({_BN_MON})\s*,?\s*(20\d\d)"), "d_bnmon_y"),
    (re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b"), "dmy"),
]


def find_date(text: str) -> dt.date | None:
    """First plausible calendar date in (normalised) text; day-first for numeric dates."""
    best: tuple[int, dt.date] | None = None
    for rx, kind in _DATE_RXS:
        for m in rx.finditer(text):
            g = m.groups()
            try:
                if kind == "ymd":
                    d = dt.date(int(g[0]), int(g[1]), int(g[2]))
                elif kind == "d_mon_y":
                    d = dt.date(int(g[2]), _EN_MONTHS[g[1].lower()], int(g[0]))
                elif kind == "mon_d_y":
                    d = dt.date(int(g[2]), _EN_MONTHS[g[0].lower()], int(g[1]))
                elif kind == "d_bnmon_y":
                    d = dt.date(int(g[2]), _BN_MONTHS[_nfc(g[1])], int(g[0]))
                else:
                    d = dt.date(int(g[2]), int(g[1]), int(g[0]))
            except (ValueError, KeyError):
                continue
            if best is None or m.start() < best[0]:
                best = (m.start(), d)
            break  # only the first match per pattern matters
    return best[1] if best else None


def _html_published_date(soup: BeautifulSoup) -> dt.date | None:
    """Publication date from common article metadata, converted to Asia/Dhaka."""
    candidates: list[str] = []
    for attr, name in (
        ("property", "article:published_time"),
        ("name", "article:published_time"),
        ("itemprop", "datePublished"),
        ("name", "date"),
        ("name", "pubdate"),
    ):
        tag = soup.find("meta", attrs={attr: name})
        if tag and tag.get("content"):
            candidates.append(str(tag["content"]))
    time_tag = soup.find("time", attrs={"datetime": True})
    if time_tag:
        candidates.append(str(time_tag["datetime"]))
    for c in candidates:
        try:
            ts = dt.datetime.fromisoformat(c.strip().replace("Z", "+00:00"))
        except ValueError:
            d = find_date(normalize_text(c))
            if d:
                return d
            continue
        if ts.tzinfo is not None:
            ts = ts.astimezone(DHAKA_TZ)
        return ts.date()
    return None


# ---------------------------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------------------------


@dataclass
class Bulletin:
    """Figures for the 24 h window ending 08:00 on `date` (date may be unknown)."""

    date: dt.date | None = None
    admissions: dict[str, int] = field(default_factory=dict)
    deaths: dict[str, int] = field(default_factory=dict)
    total_admissions: int | None = None
    total_deaths: int | None = None

    @property
    def empty(self) -> bool:
        return not self.admissions and self.total_admissions is None

    def to_case_counts(self, date: dt.date, source_url: str) -> list[CaseCount]:
        """Rows for `case_counts`. Areas without a listed death count get deaths=0."""
        rows: list[CaseCount] = []
        for area in REGIONAL_AREAS:
            if area in self.admissions:
                rows.append(
                    CaseCount(
                        date, area, self.admissions[area], self.deaths.get(area, 0), source_url
                    )
                )
        total_adm = self.total_admissions
        if total_adm is None and all(a in self.admissions for a in REGIONAL_AREAS):
            total_adm = sum(self.admissions[a] for a in REGIONAL_AREAS)
        if total_adm is not None:
            total_deaths = self.total_deaths
            if total_deaths is None:
                total_deaths = sum(self.deaths.get(a, 0) for a in REGIONAL_AREAS)
            rows.append(CaseCount(date, "BANGLADESH", total_adm, total_deaths, source_url))
        return rows

    def warnings(self) -> list[str]:
        """Consistency checks worth logging (never fatal: bulletins have typos too)."""
        out: list[str] = []
        regional = sum(self.admissions.values())
        if self.total_admissions is not None and regional > self.total_admissions:
            out.append(
                f"sum of area admissions ({regional}) exceeds national total "
                f"({self.total_admissions})"
            )
        missing = [a for a in ("DNCC", "DSCC") if a not in self.admissions]
        if missing:
            out.append(f"no figures for {', '.join(missing)}")
        for area, n in {**self.admissions, **self.deaths}.items():
            if n > 20000:
                out.append(f"implausible count {n} for {area}")
        return out


def parse_text(text: str) -> Bulletin:
    """Parse press-release prose (English or Bangla)."""
    norm = _drop_plain_parentheticals(normalize_text(text))
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(norm) if s and s.strip()]
    b = Bulletin(date=find_date(norm))
    ctx: str | None = None
    for s in sentences:
        areas = find_areas(s)
        ctx = _classify(s, areas[0].start if areas else None, ctx)
        if not areas or ctx is None:
            continue
        target = b.admissions if ctx == "admissions" else b.deaths
        for code, n in _pairs(s).items():
            target.setdefault(code, n)  # first figure wins; later ones are often cumulative
    b.total_admissions = _find_total(sentences, _ADMIT_TOTAL_RXS)
    b.total_deaths = _find_total(sentences, _DEATH_TOTAL_RXS)
    if b.total_deaths is None and any(_NO_DEATHS_RX.search(s) for s in sentences):
        b.total_deaths = 0
    return b


_TABLE_CUMULATIVE = _rx(
    r"total|cumulative|since|year|month|discharg|released|recover|currently|under\s+treatment"
    r"|মোট|সর্বমোট|ছাড়পত্র|ছাড়া\s*পেয়েছেন|বর্তমানে|চিকিৎসাধীন|বছর|মাস"
)


def _table_grid(table: Tag) -> list[list[str]]:
    """Cell texts of a table as a rectangular-ish grid, honouring colspan and rowspan."""
    grid: list[list[str]] = []
    pending: dict[int, tuple[str, int]] = {}  # column -> (text, rows still to fill)

    def take_pending(row: list[str], col: int) -> None:
        text, left = pending.pop(col)
        row.append(text)
        if left > 1:
            pending[col] = (text, left - 1)

    for tr in table.find_all("tr"):
        row: list[str] = []
        col = 0
        for cell in tr.find_all(["td", "th"]):
            while col in pending:
                take_pending(row, col)
                col += 1
            text = cell.get_text(" ", strip=True)
            colspan = _span(cell.get("colspan"))
            rowspan = _span(cell.get("rowspan"))
            for _ in range(colspan):
                row.append(text)
                if rowspan > 1:
                    pending[col] = (text, rowspan - 1)
                col += 1
        for c in sorted(k for k in pending if k >= col):
            row.extend([""] * (c - col))
            take_pending(row, c)
            col = c + 1
        grid.append(row)
    return grid


def _span(value: object) -> int:
    try:
        return max(1, min(50, int(str(value)))) if value is not None else 1
    except ValueError:
        return 1


def _pick_column(headers: list[str], kw: re.Pattern[str], exclude: set[int]) -> int | None:
    cands = [i for i, h in enumerate(headers) if i not in exclude and kw.search(h)]
    if not cands:
        return None
    for pred in (
        lambda h: bool(_WINDOW_24H.search(h)),
        lambda h: not _TABLE_CUMULATIVE.search(h),
    ):
        good = [i for i in cands if pred(headers[i])]
        if good:
            return good[0]
    return None  # only cumulative columns


def parse_tables(html: str) -> Bulletin:
    """Parse the best-looking area table in an HTML document."""
    soup = BeautifulSoup(html, "html.parser")
    best = Bulletin()
    for table in soup.find_all("table"):
        rows = _table_grid(table)
        rows = [r for r in rows if any(c.strip() for c in r)]
        if not rows:
            continue
        # Header rows are everything before the first row that names an area.
        first_data = next(
            (i for i, r in enumerate(rows) if any(area_from_label(c) for c in r[:2])), None
        )
        if first_data is None:
            continue
        width = max(len(r) for r in rows)
        headers = [
            normalize_text(" ".join(r[i] for r in rows[:first_data] if i < len(r)))
            for i in range(width)
        ]
        label_col = 0 if any(area_from_label(r[0]) for r in rows[first_data:]) else 1
        adm_col = _pick_column(headers, _ADMIT_KW, {label_col})
        exclude = {label_col} if adm_col is None else {label_col, adm_col}
        death_col = _pick_column(headers, _DEATH_KW, exclude)
        if adm_col is None and death_col is None:
            if width == 3 and label_col == 0 and not any(headers):
                adm_col, death_col = 1, 2  # bare "area | admitted | deaths" table
            else:
                continue
        b = Bulletin()
        for r in rows[first_data:]:
            if label_col >= len(r):
                continue
            area = area_from_label(r[label_col])
            if area is None:
                continue
            adm = cell_int(r[adm_col]) if adm_col is not None and adm_col < len(r) else None
            dth = cell_int(r[death_col]) if death_col is not None and death_col < len(r) else None
            if area == "BANGLADESH":
                if adm is not None:
                    b.total_admissions = adm
                if dth is not None:
                    b.total_deaths = dth
                continue
            if adm is not None:
                b.admissions.setdefault(area, adm)
            if dth is not None:
                b.deaths.setdefault(area, dth)
        if len(b.admissions) > len(best.admissions):
            best = b
    return best


def parse_html(html: str) -> Bulletin:
    """Tables first; fall back to (or complement with) the page's prose."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()
    article = soup.find("article") or soup.find("main") or soup.body or soup
    text = article.get_text("\n", strip=True)
    from_text = parse_text(text)
    b = parse_tables(html)
    if len(b.admissions) < 2:
        b = from_text
    else:
        if b.total_admissions is None:
            b.total_admissions = from_text.total_admissions
        if b.total_deaths is None:
            b.total_deaths = from_text.total_deaths
    # Date: article metadata is the most reliable for news pages; then the text itself.
    meta_soup = BeautifulSoup(html, "html.parser")
    b.date = _html_published_date(meta_soup) or from_text.date
    return b


def looks_like_html(content: str) -> bool:
    head = content[:2000].lower()
    return "<html" in head or "<table" in head or "<body" in head or "<p>" in head
