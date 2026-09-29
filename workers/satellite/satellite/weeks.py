"""ISO-week helpers. A `ward_risk.week` is the Monday (Asia/Dhaka) that starts the week.

All inputs for week W use data strictly *before* W 00:00 Asia/Dhaka, so a run on Monday
03:00 describes the week that just ended and is reproducible when re-run later.
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

DHAKA_TZ = ZoneInfo("Asia/Dhaka")


def week_start(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())


def current_week(now: dt.datetime | None = None) -> dt.date:
    now = now or dt.datetime.now(tz=DHAKA_TZ)
    return week_start(now.astimezone(DHAKA_TZ).date())


def parse_week(value: str) -> dt.date:
    """Parse YYYY-MM-DD (any day; snapped to its Monday) or ISO week YYYY-Www."""
    value = value.strip()
    if "W" in value.upper():
        year, _, wk = value.upper().partition("-W")
        return dt.date.fromisocalendar(int(year), int(wk), 1)
    return week_start(dt.date.fromisoformat(value))


def week_start_ts(week: dt.date) -> dt.datetime:
    """Monday 00:00 Asia/Dhaka as an aware datetime."""
    return dt.datetime.combine(week, dt.time(0, 0), tzinfo=DHAKA_TZ)
