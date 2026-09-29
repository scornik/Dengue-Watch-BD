import pytest

from detector.train import check_dataset, main


def _touch(root, split, cls, n):
    d = root / split / cls
    d.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        (d / f"{i}.jpg").write_bytes(b"x")


def test_check_dataset_counts(tmp_path):
    _touch(tmp_path, "train", "drain", 3)
    _touch(tmp_path, "train", "not_relevant", 2)
    _touch(tmp_path, "val", "drain", 1)
    counts = check_dataset(tmp_path)
    assert counts == {"train": {"drain": 3, "not_relevant": 2}, "val": {"drain": 1}}


def test_check_dataset_errors(tmp_path):
    with pytest.raises(ValueError, match="missing"):
        check_dataset(tmp_path)
    _touch(tmp_path, "train", "drain", 3)
    _touch(tmp_path, "val", "drain", 1)
    with pytest.raises(ValueError, match="at least 2"):
        check_dataset(tmp_path)
    _touch(tmp_path, "train", "unicorn", 1)
    with pytest.raises(ValueError, match="unknown"):
        check_dataset(tmp_path)


def test_main_fails_on_bad_dataset(tmp_path):
    assert main(["--data", str(tmp_path)]) == 2
