#!/usr/bin/env bash
# Load supabase/seed/wards.geojson into the wards table.
# Usage: DATABASE_URL=postgresql://... bash supabase/seed/load_wards.sh [file.geojson]
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
FILE="${1:-$(dirname "$0")/wards.geojson}"
psql "$DB_URL" -v ON_ERROR_STOP=1 -v fc="$(cat "$FILE")" \
  -c "select public.upsert_wards_geojson(:'fc'::jsonb, 'osm') as wards_loaded;"
