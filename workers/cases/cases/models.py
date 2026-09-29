"""Plain data types shared by the parser, sources and DB layer."""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass

# Area codes accepted by the `case_counts.area` column.
AREAS: tuple[str, ...] = (
    "DNCC",
    "DSCC",
    "DHAKA_DIV",
    "CHATTOGRAM_DIV",
    "KHULNA_DIV",
    "RAJSHAHI_DIV",
    "RANGPUR_DIV",
    "MYMENSINGH_DIV",
    "BARISHAL_DIV",
    "SYLHET_DIV",
    "BANGLADESH",
)
# Areas that together make up the national total (everything except BANGLADESH).
REGIONAL_AREAS: tuple[str, ...] = AREAS[:-1]


@dataclass(frozen=True, slots=True)
class CaseCount:
    """One row of `case_counts`: admissions/deaths in the 24 h ending 08:00 on `date`."""

    date: dt.date
    area: str
    admissions: int
    deaths: int
    source_url: str

    def __post_init__(self) -> None:
        if self.area not in AREAS:
            raise ValueError(f"unknown area code {self.area!r}")
        if self.admissions < 0 or self.deaths < 0:
            raise ValueError("counts must be non-negative")

    def to_json(self) -> dict[str, object]:
        d = asdict(self)
        d["date"] = self.date.isoformat()
        return d
