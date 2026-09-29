"""Class list, moderator-label mapping and the deterministic train/val split."""

from __future__ import annotations

import hashlib

# Breeding-site classes mirror reports.site_type; plus a negative class.
SITE_CLASSES: tuple[str, ...] = (
    "tire",
    "bucket_drum",
    "ac_drip",
    "construction",
    "rooftop",
    "flower_tub",
    "drain",
    "other",
)
NOT_RELEVANT = "not_relevant"
CLASSES: tuple[str, ...] = (*SITE_CLASSES, NOT_RELEVANT)

# Tolerated spellings from older forms / moderators.
_ALIASES: dict[str, str] = {
    "tyre": "tire",
    "tires": "tire",
    "tyres": "tire",
    "bucket": "bucket_drum",
    "drum": "bucket_drum",
    "bucket/drum": "bucket_drum",
    "ac": "ac_drip",
    "ac_tray": "ac_drip",
    "construction_site": "construction",
    "roof": "rooftop",
    "flower_pot": "flower_tub",
    "flowerpot": "flower_tub",
    "tub": "flower_tub",
    "flower_pot_tub": "flower_tub",
    "drain_gutter": "drain",
    "gutter": "drain",
}
# Moderator verdicts meaning "yes, a real potential breeding site" -> use the site type.
_POSITIVE = {"likely", "verified", "relevant", "breeding_site", "yes", "positive", "approved"}
_NEGATIVE = {"not_relevant", "rejected", "spam", "no", "negative", "irrelevant"}


def _norm(value: str | None) -> str:
    return (value or "").strip().lower().replace(" ", "_").replace("-", "_")


def normalize_site_type(site_type: str | None) -> str | None:
    s = _norm(site_type)
    s = _ALIASES.get(s, s)
    return s if s in SITE_CLASSES else None


def map_label(moderator_label: str | None, site_type: str | None) -> str | None:
    """Training class for a moderated report, or None to leave it out of the dataset.

    * A moderator label that is itself a class (e.g. "drain") wins.
    * Negative verdicts -> "not_relevant".
    * Positive verdicts -> the reporter's site_type ("other" if unknown).
    * "unclear" and anything unrecognised -> None (ambiguous examples hurt training).
    """
    label = _norm(moderator_label)
    if label in _NEGATIVE:
        return NOT_RELEVANT
    direct = normalize_site_type(label)
    if direct is not None:
        return direct
    if label in _POSITIVE:
        return normalize_site_type(site_type) or "other"
    return None


def split_for(report_id: str, val_pct: int = 20) -> str:
    """Stable train/val assignment from a hash of the report id (never changes over time)."""
    if not 0 <= val_pct <= 100:
        raise ValueError("val_pct must be within 0..100")
    bucket = int.from_bytes(hashlib.sha256(report_id.encode()).digest()[:4], "big") % 100
    return "val" if bucket < val_pct else "train"
