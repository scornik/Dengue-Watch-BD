# Operations: backups, restore, load, monitoring

## What holds state

| Store | Contents | Loss impact |
| --- | --- | --- |
| Supabase Postgres | wards, reports, sites, site_events (audit), profiles, ward_risk, case_counts, ai_labels, push subscriptions | Critical |
| Storage `report-photos` (private) | EXIF-stripped originals | High (moderation evidence, P3 training data) |
| Storage `after-photos` (private) | Inspector "cleared" evidence | High (accountability) |
| Storage `public-thumbs` (public) | Blurred thumbnails | Low: regenerate with `workers/thumbs` (set `thumb_status='pending'`) |
| Vault secrets | `project_url`, `service_role_key` for pg_cron | Recreate from dashboard |
| Browser IndexedDB | Reports not yet uploaded | Per device; retried automatically |

Everything else (web app, functions, workers) is rebuilt from git.

## Backups

1. **Supabase managed backups.** Pro plan: daily backups kept 7 days. Enable **Point-in-Time Recovery** (paid add-on) once real pilot data flows; the scorecard is public accountability, so losing a day matters.
2. **Independent weekly logical dump** (free, survives account problems). Run from any machine or a Northflank cron job with `pg_dump` available:

   ```bash
   # Session-mode connection string (port 5432), not the transaction pooler
   pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
     --schema=public --schema=auth --file="denguewatch-$(date +%F).dump"
   # Encrypt before storing off-site (contains emails and phone-verification state)
   age -r "$BACKUP_AGE_PUBLIC_KEY" -o "denguewatch-$(date +%F).dump.age" "denguewatch-$(date +%F).dump"
   ```

   Keep 8 weekly and 12 monthly copies in a separate storage account.
3. **Storage objects.** Supabase Storage is S3-compatible; mirror the private buckets weekly:

   ```bash
   aws s3 sync s3://report-photos ./backup/report-photos \
     --endpoint-url "https://<ref>.supabase.co/storage/v1/s3" --profile supabase
   aws s3 sync s3://after-photos ./backup/after-photos \
     --endpoint-url "https://<ref>.supabase.co/storage/v1/s3" --profile supabase
   ```

   (Create S3 access keys under Project Settings → Storage.)

## Restore

1. Create a fresh Supabase project (or a branch) and link it: `supabase link --project-ref <new-ref>`.
2. Apply the schema from git: `supabase db push` (migrations are the source of truth for functions, RLS, views and cron).
3. Restore data only:

   ```bash
   pg_restore --data-only --disable-triggers --no-owner \
     --schema=public --schema=auth -d "$NEW_DATABASE_URL" denguewatch-YYYY-MM-DD.dump
   ```

   `--disable-triggers` stops the report trigger from re-merging sites and the rate limiter from rejecting historical rows. Restoring `auth` keeps staff accounts and anonymous reporter ids (so "My reports" and push keep working).
4. Sync storage buckets back (`aws s3 sync ./backup/report-photos s3://report-photos …`).
5. Re-create the Vault secrets (`project_url`, `service_role_key`), function secrets (`supabase secrets set …`), and redeploy functions.
6. Point Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and Northflank (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) at the new project.
7. Smoke test: submit a report from a phone, approve it in `/staff/moderate`, check `/map` and a ward page.

**Test the restore every quarter** into a Supabase branch and write down how long it took.

## Load test (M9)

`scripts/loadtest.mjs` posts reports through `submit-report` at a fixed rate, each from a distinct device, a third of them clustered so the duplicate-merge path runs.

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... node scripts/loadtest.mjs --rate 50 --minutes 2
```

Results on the local stack (2026-09-29, 4 vCPU container, Supabase CLI 2.118, edge runtime 1.76):

| Rate | Reports | Accepted | p50 | p95 | p99 | Max |
| --- | --- | --- | --- | --- | --- | --- |
| 50/min (target) | 100 | 100 % | 50 ms | 83 ms | 119 ms | 119 ms |
| 500/min (10× headroom) | 500 | 100 % | 47 ms | 83 ms | 332 ms | 611 ms |

100 reports became 76 sites (merge within 25 m / 7 days worked under concurrency; the advisory lock serialises only the site lookup). Hosted Supabase adds network latency; re-run against a staging project before launch and on every major schema change. Clean up with `delete from reports where note = 'loadtest';` (sites with no reports left can be deleted the same way).

## Monitoring checklist

- **Northflank job failures** (cases scraper exits non-zero when the bulletin can't be parsed → enter numbers manually on `/staff/admin`).
- **pg_cron runs:** `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 20;`
- **Thumbnail backlog:** `select thumb_status, count(*) from reports group by 1;` — many `failed` rows usually mean the YuNet model is missing from the image.
- **Moderation backlog:** `select count(*) from moderation_queue;` (as a moderator) or the count on `/staff/moderate`.
- **Paid AI spend (if enabled):** `select * from ai_usage order by day desc limit 14;`
- **Overdue sites:** `/staff/digest` or `select sum(overdue_28d) from public_ward_scorecard;`

## Secret rotation

| Secret | Where | Rotate by |
| --- | --- | --- |
| Service role key / JWT secret | Supabase | Dashboard → API → roll; update Vault `service_role_key`, Northflank env |
| `DEVICE_HASH_SALT` | function secrets | Changing it resets per-device rate-limit history (acceptable); do it only if leaked |
| VAPID keys | function secrets + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | New keys invalidate existing push subscriptions; users re-enable notifications |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | function secrets | Provider console |
| `RESEND_API_KEY` | function secrets | Resend dashboard |
| `DETECTOR_TOKEN` | function secrets + Northflank service | Set both, redeploy |
