#!/usr/bin/env bash
# Prepares the LOCAL stack for the app screen recordings (never production):
#   1. resets the local database (migrations + the 129 wards)
#   2. optionally loads real ward boundaries: WARDS_GEOJSON=path/to/wards.geojson
#      (otherwise dev_demo.sql draws a synthetic grid)
#   3. loads supabase/seed/dev_demo.sql (demo reports, hunters, risk, cases)
#   4. adds a cluster of demo spots with photos around Mirpur 10, where record.mjs stands
#
# Then build and start the web app on :3100 and run record.mjs (see media/README.md).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
eval "$(supabase status -o env)"
case "$API_URL" in http://127.0.0.1*|http://localhost*) ;; *) echo "refusing: $API_URL is not local"; exit 1 ;; esac

supabase db reset

if [ -n "${WARDS_GEOJSON:-}" ]; then
  # Written to a file: the GeoJSON is too large for a psql argument.
  SQL=$(mktemp --suffix .sql)
  python3 - "$WARDS_GEOJSON" "$SQL" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for f in d["features"]:
    f["properties"] = {k: f["properties"].get(k) for k in ("city_corp", "ward_no", "name_bn", "name_en")}
open(sys.argv[2], "w").write("select public.upsert_wards_geojson($gj$" + json.dumps(d, ensure_ascii=False) + "$gj$::jsonb, 'osm');\n")
PY
  psql "$DB_URL" -v ON_ERROR_STOP=1 -tA -f "$SQL"
  rm -f "$SQL"
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed/dev_demo.sql

PHOTOS=media/capture/photos
TMP=$(mktemp -d)
ffmpeg -y -loglevel error -i $PHOTOS/bucket-water.jpg -vf "scale=480:-1" -q:v 4 "$TMP/1.jpg"
ffmpeg -y -loglevel error -i $PHOTOS/bucket-water.jpg -vf "crop=600:600:250:120,scale=480:480" -q:v 4 "$TMP/2.jpg"
for n in 1 2; do
  curl -sf -o /dev/null -X POST "$API_URL/storage/v1/object/public-thumbs/demo/bucket-$n.jpg" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: image/jpeg" -H "x-upsert: true" --data-binary "@$TMP/$n.jpg"
done
rm -rf "$TMP"

psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<'SQL'
insert into public.reports (photo_path, thumb_public_path, thumb_status, geom, site_type, larvae_seen, device_hash, created_at)
values
 ('demo/a.jpg','demo/bucket-1.jpg','ok','SRID=4326;POINT(90.36880 23.80705)','bucket_drum','yes','demo-recording-0001', now() - interval '5 hours'),
 ('demo/b.jpg','demo/bucket-2.jpg','ok','SRID=4326;POINT(90.37010 23.80610)','bucket_drum','unsure','demo-recording-0002', now() - interval '4 days'),
 ('demo/c.jpg',null,'pending','SRID=4326;POINT(90.36720 23.80820)','tire','yes','demo-recording-0003', now() - interval '1 day'),
 ('demo/d.jpg',null,'pending','SRID=4326;POINT(90.37150 23.80790)','flower_tub','no','demo-recording-0004', now() - interval '20 hours'),
 ('demo/e.jpg',null,'pending','SRID=4326;POINT(90.36610 23.80540)','ac_drip','unsure','demo-recording-0005', now() - interval '2 days');
SQL
echo "Local demo data ready."
