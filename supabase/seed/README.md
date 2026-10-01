# Seed data

| File | What |
| --- | --- |
| `../seed.sql` | The 129 Dhaka wards (DNCC 1–54 → ids 1–54, DSCC 1–75 → ids 101–175) with Bangla/English names, no geometry. Runs on `supabase db reset`. |
| `wards.geojson` | All 129 ward boundaries. Produced by `fetch_wards_dghs.py` from the DGHS EPI GIS dashboard (Government of Bangladesh). |
| `fetch_wards_dghs.py` | Downloads the DGHS DNCC/DSCC ward layers and checks completeness and overlap. |
| `fetch_wards.py` | Alternative: OpenStreetMap Overpass query + polygon assembly. Prints which wards are missing (OSM had none usable in Oct 2026). |
| `load_wards.sh` | Loads a GeoJSON FeatureCollection via `public.upsert_wards_geojson()`. |
| `dev_demo.sql` | Optional synthetic demo data for local development only (never load in production). |

```bash
uv run --with shapely --with requests python supabase/seed/fetch_wards_dghs.py
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/seed/load_wards.sh
```

Feature properties expected by the loader (also by the admin upload page at `/admin/wards`):
`city_corp` (`DNCC`|`DSCC`), `ward_no` (integer), optional `name_bn`, `name_en`.

Source and comparison with DNCC's own layer: see DECISIONS.md (2026-10-01).
