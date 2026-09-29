# Seed data

| File | What |
| --- | --- |
| `../seed.sql` | The 129 Dhaka wards (DNCC 1–54 → ids 1–54, DSCC 1–75 → ids 101–175) with Bangla/English names, no geometry. Runs on `supabase db reset`. |
| `wards.geojson` | Ward boundaries. Produced by `fetch_wards.py` from OpenStreetMap (ODbL). |
| `fetch_wards.py` | Overpass query + polygon assembly. Prints which wards are missing. |
| `load_wards.sh` | Loads a GeoJSON FeatureCollection via `public.upsert_wards_geojson()`. |
| `dev_demo.sql` | Optional synthetic demo data for local development only (never load in production). |

```bash
uv run --with shapely --with requests python supabase/seed/fetch_wards.py
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/seed/load_wards.sh
```

Feature properties expected by the loader (also by the admin upload page at `/admin/wards`):
`city_corp` (`DNCC`|`DSCC`), `ward_no` (integer), optional `name_bn`, `name_en`.

Status: see DECISIONS.md — the committed `wards.geojson` is empty because Overpass
was not reachable from the build sandbox. Run the script from a normal network and
commit the result, or upload official DNCC/DSCC boundaries on `/admin/wards`.
