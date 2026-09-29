import pytest

from detector.labels import CLASSES, NOT_RELEVANT, SITE_CLASSES, map_label, split_for


def test_class_list():
    assert CLASSES == (
        "tire", "bucket_drum", "ac_drip", "construction", "rooftop", "flower_tub", "drain",
        "other", "not_relevant",
    )  # fmt: skip
    assert NOT_RELEVANT not in SITE_CLASSES


@pytest.mark.parametrize(
    ("moderator", "site", "expected"),
    [
        ("drain", "tire", "drain"),  # moderator's class wins over reporter's site type
        ("Bucket/Drum", None, "bucket_drum"),
        ("likely", "ac_drip", "ac_drip"),
        ("verified", "Tyre", "tire"),
        ("likely", "flower pot", "flower_tub"),
        ("likely", None, "other"),
        ("likely", "weird", "other"),
        ("not_relevant", "tire", "not_relevant"),
        ("rejected", None, "not_relevant"),
        ("spam", "drain", "not_relevant"),
        ("unclear", "drain", None),
        ("", "drain", None),
        (None, "drain", None),
        ("something new", "drain", None),
    ],
)
def test_map_label(moderator, site, expected):
    assert map_label(moderator, site) == expected


def test_split_is_deterministic_and_roughly_proportional():
    ids = [f"00000000-0000-4000-8000-{i:012d}" for i in range(2000)]
    first = [split_for(i, 20) for i in ids]
    assert first == [split_for(i, 20) for i in ids]
    share = first.count("val") / len(ids)
    assert 0.17 < share < 0.23


def test_split_edges():
    assert split_for("x", 0) == "train"
    assert split_for("x", 100) == "val"
    with pytest.raises(ValueError):
        split_for("x", 101)
