import datetime as dt
import json

import httpx
import pytest

from satellite.weather import fetch_rain_sums, ward_rainfall

FORECAST = "https://api.example/forecast"
ARCHIVE = "https://archive.example/archive"
START, END = dt.date(2026, 9, 14), dt.date(2026, 9, 27)


def _loc(values):
    return {"daily": {"time": [], "precipitation_sum": values}}


def test_batched_request_and_sums():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        lats = req.url.params["latitude"].split(",")
        return httpx.Response(200, json=[_loc([1.0, None, 2.5]) for _ in lats])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    pts = [(23.7 + i / 100, 90.4) for i in range(3)]
    out = fetch_rain_sums(
        client, pts, START, END, forecast_url=FORECAST, archive_url=ARCHIVE, today=END
    )
    assert out == [3.5, 3.5, 3.5]
    assert len(seen) == 1
    p = seen[0].url.params
    assert p["daily"] == "precipitation_sum"
    assert p["start_date"] == "2026-09-14" and p["end_date"] == "2026-09-27"
    assert p["timezone"] == "Asia/Dhaka"
    assert str(seen[0].url).startswith(FORECAST)


def test_single_location_object_and_all_null():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json=_loc([None, None]))
    ))  # fmt: skip
    out = fetch_rain_sums(
        client, [(23.8, 90.4)], START, END, forecast_url=FORECAST, archive_url=ARCHIVE, today=END
    )
    assert out == [None]


def test_old_weeks_use_archive_endpoint():
    urls = []

    def handler(req):
        urls.append(str(req.url))
        return httpx.Response(200, json=_loc([0.0]))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    fetch_rain_sums(client, [(23.8, 90.4)], START, END, forecast_url=FORECAST,
                    archive_url=ARCHIVE, today=END + dt.timedelta(days=200))  # fmt: skip
    assert urls[0].startswith(ARCHIVE)


def test_batches_of_50(monkeypatch):
    calls = []

    def handler(req):
        n = len(req.url.params["latitude"].split(","))
        calls.append(n)
        return httpx.Response(200, json=[_loc([1.0])] * n if n > 1 else _loc([1.0]))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    pts = [(23.0 + i / 1000, 90.0) for i in range(120)]
    out = fetch_rain_sums(client, pts, START, END, forecast_url=FORECAST, archive_url=ARCHIVE,
                          today=END)  # fmt: skip
    assert calls == [50, 50, 20]
    assert len(out) == 120


def test_ward_rainfall_dedupes_rounded_points():
    def handler(req):
        lats = req.url.params["latitude"].split(",")
        body = [_loc([float(lat)]) for lat in lats]
        return httpx.Response(200, content=json.dumps(body if len(lats) > 1 else body[0]))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    out = ward_rainfall(
        client, {1: (23.8001, 90.4), 2: (23.7999, 90.4002), 3: (23.75, 90.41)}, START, END,
        fallback=(23.81, 90.41), forecast_url=FORECAST, archive_url=ARCHIVE, today=END,
    )  # fmt: skip
    assert out == {1: pytest.approx(23.8), 2: pytest.approx(23.8), 3: pytest.approx(23.75)}


def test_ward_rainfall_falls_back_to_city_then_none():
    def handler(req):
        if "," in req.url.params["latitude"]:
            return httpx.Response(500)
        return httpx.Response(200, json=_loc([4.0, 6.0]))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    args = dict(fallback=(23.81, 90.41), forecast_url=FORECAST, archive_url=ARCHIVE, today=END)
    out = ward_rainfall(client, {1: (23.7, 90.3), 2: (23.9, 90.5)}, START, END, **args)
    assert out == {1: 10.0, 2: 10.0}

    dead = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503)))
    assert ward_rainfall(dead, {1: (23.7, 90.3)}, START, END, **args) == {1: None}
