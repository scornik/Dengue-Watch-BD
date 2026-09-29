from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_path():
    def _get(name: str) -> Path:
        return FIXTURES / name

    return _get


@pytest.fixture
def read_fixture():
    def _read(name: str) -> str:
        return (FIXTURES / name).read_text(encoding="utf-8")

    return _read
