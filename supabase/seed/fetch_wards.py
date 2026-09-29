"""Fetch Dhaka city-corporation ward boundaries from OpenStreetMap (Overpass).

Writes supabase/seed/wards.geojson with one Feature per ward:
  properties: city_corp (DNCC|DSCC), ward_no, name_en, name_bn, osm_id

Usage (from repo root):
  uv run --with shapely --with requests python supabase/seed/fetch_wards.py
  bash supabase/seed/load_wards.sh          # loads the file into the database

OSM data (c) OpenStreetMap contributors, ODbL. Coverage of Dhaka ward
boundaries in OSM is incomplete; the script reports which wards are missing so
the gap can be logged and filled through the admin GeoJSON upload page.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests
from shapely.geometry import LineString, MultiPolygon, mapping
from shapely.ops import polygonize, unary_union

OVERPASS = "https://overpass-api.de/api/interpreter"
OUT = Path(__file__).with_name("wards.geojson")
EXPECTED = {"DNCC": 54, "DSCC": 75}

CITY_NAMES = {
    "DNCC": "Dhaka North City Corporation",
    "DSCC": "Dhaka South City Corporation",
}

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
WARD_RE = re.compile(r"(?:ward|ওয়ার্ড|ওয়ার্ড)\s*(?:no\.?|নং|নম্বর)?\s*[-:#]?\s*(\d{1,2})", re.I)


def query(city: str) -> dict:
    q = f"""
    [out:json][timeout:180];
    area["name"="{city}"]["boundary"="administrative"]->.city;
    rel(area.city)["boundary"="administrative"]["admin_level"~"^(8|9|10)$"];
    out geom;
    """
    r = requests.post(OVERPASS, data={"data": q}, timeout=240)
    r.raise_for_status()
    return r.json()


def ward_no(tags: dict) -> int | None:
    for key in ("ref", "name:en", "name", "name:bn", "official_name"):
        val = str(tags.get(key, "")).translate(BN_DIGITS)
        if key == "ref" and val.isdigit():
            return int(val)
        m = WARD_RE.search(val)
        if m:
            return int(m.group(1))
    return None


def relation_polygon(rel: dict) -> MultiPolygon | None:
    lines = []
    for m in rel.get("members", []):
        if m.get("type") == "way" and m.get("role") in ("outer", "") and m.get("geometry"):
            coords = [(p["lon"], p["lat"]) for p in m["geometry"]]
            if len(coords) >= 2:
                lines.append(LineString(coords))
    polys = list(polygonize(unary_union(lines)))
    if not polys:
        return None
    merged = unary_union(polys)
    return merged if isinstance(merged, MultiPolygon) else MultiPolygon([merged])


def main() -> int:
    features = []
    found: dict[str, set[int]] = {k: set() for k in EXPECTED}
    for corp, city in CITY_NAMES.items():
        data = query(city)
        for el in data.get("elements", []):
            tags = el.get("tags", {})
            no = ward_no(tags)
            if no is None or not (1 <= no <= EXPECTED[corp]) or no in found[corp]:
                continue
            geom = relation_polygon(el)
            if geom is None or geom.is_empty:
                continue
            found[corp].add(no)
            features.append({
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {
                    "city_corp": corp,
                    "ward_no": no,
                    "name_en": tags.get("name:en") or tags.get("name"),
                    "name_bn": tags.get("name:bn"),
                    "osm_id": el.get("id"),
                },
            })
    features.sort(key=lambda f: (f["properties"]["city_corp"], f["properties"]["ward_no"]))
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False))

    for corp, total in EXPECTED.items():
        missing = sorted(set(range(1, total + 1)) - found[corp])
        print(f"{corp}: {len(found[corp])}/{total} wards found; missing: {missing or 'none'}")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
