"""Fetch Dhaka city-corporation ward boundaries from the DGHS EPI GIS dashboard.

Source: Directorate General of Health Services (DGHS), Government of Bangladesh,
the city-corporation ward layers behind
https://dashboard.dghs.gov.bd/pages/dashboard_gis_city_corporation.php
(DNCC cc_id=4, 54 wards; DSCC cc_id=5, 75 wards). Both layers come from one
government source, are valid polygons, and do not overlap each other, which a
mix of sources does not guarantee.

Writes supabase/seed/wards.geojson with one Feature per ward:
  properties: city_corp (DNCC|DSCC), ward_no, zone, dghs_ward_id

Usage (from repo root):
  uv run --with shapely --with requests python supabase/seed/fetch_wards_dghs.py
  DATABASE_URL=... bash supabase/seed/load_wards.sh
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

BASE = "https://dashboard.dghs.gov.bd/files/geojason/phc"
OUT = Path(__file__).with_name("wards.geojson")
EXPECTED = {"DNCC": 54, "DSCC": 75}


def js_object(text: str) -> dict:
    """Parse `var x={type: "FeatureCollection", ...}` (unquoted keys) as JSON."""
    body = text[text.index("{"): text.rindex("}") + 1]
    body = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', body)
    body = re.sub(r",(\s*[}\]])", r"\1", body)
    return json.loads(body)


def rounded(geom: dict, nd: int = 6) -> dict:
    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], float | int) else [r(x) for x in c]
    return {"type": geom["type"], "coordinates": r(geom["coordinates"])}


def main() -> int:
    features = []
    for corp, total in EXPECTED.items():
        resp = requests.get(f"{BASE}/{corp.lower()}.js", timeout=120, headers={"User-Agent": "DengueWatchBD"})
        resp.raise_for_status()
        fc = js_object(resp.text)
        seen = set()
        for f in fc["features"]:
            p = f["properties"]
            no = int(re.sub(r"\D", "", str(p["ward_no"])))
            geom = shape(f["geometry"])
            if not geom.is_valid:
                geom = geom.buffer(0)
            seen.add(no)
            features.append({
                "type": "Feature",
                "geometry": rounded(mapping(geom)),
                "properties": {
                    "city_corp": corp,
                    "ward_no": no,
                    "zone": p.get("cc_zone"),
                    "dghs_ward_id": p.get("ward_id"),
                },
            })
        missing = sorted(set(range(1, total + 1)) - seen)
        print(f"{corp}: {len(seen)}/{total} wards; missing: {missing or 'none'}")

    by_corp = {c: unary_union([shape(f["geometry"]) for f in features if f["properties"]["city_corp"] == c]) for c in EXPECTED}
    print(f"DNCC/DSCC overlap (deg^2): {by_corp['DNCC'].intersection(by_corp['DSCC']).area:.2e}")

    features.sort(key=lambda f: (f["properties"]["city_corp"], f["properties"]["ward_no"]))
    OUT.write_text(json.dumps({
        "type": "FeatureCollection",
        "source": "DGHS EPI GIS dashboard, dashboard.dghs.gov.bd (Government of Bangladesh)",
        "features": features,
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
