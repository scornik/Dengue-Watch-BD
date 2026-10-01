# DengueWatch BD · ডেঙ্গুওয়াচ বিডি

Citizens photo-report possible **Aedes mosquito breeding sites** (standing water in tires, buckets, drums, AC drip trays, construction sites, rooftops, flower tubs, drains). Reports merge into **sites**; city-corporation **ward inspectors** work a queue and close each site with an on-site **after photo**. A public map shows sites, wards shaded by **number of reports** or by **environmental risk**, and official case counts. Pilot: Dhaka (DNCC 54 wards, DSCC 75 wards).

**Anyone can be a mosquito hunter.** The list of reported spots (with blurred photos) is public at `/sites`. A volunteer picks a hunter name and photo, claims a spot, destroys it and proves it with an on-site after photo (GPS within 50 m). They earn XP, levels and badges and climb a weekly and all-time leaderboard (`/leaderboard`). Moderators can reverse fake cleanups. Inspectors keep working their own queue as before.

Bangla first, English second. Open source under **AGPL-3.0**. Product spec: [`docs/SPEC.md`](docs/SPEC.md) · decisions log: [`DECISIONS.md`](DECISIONS.md).

> Satellites do **not** detect breeding sites. They only rank wards by environmental risk so teams know where to look first.

## Repository layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js 16 (App Router, TypeScript strict, Tailwind v4) installable PWA, deployed on Vercel |
| `messages/` | All user-facing strings: `bn.json` (default), `en.json` |
| `supabase/migrations` | Postgres + PostGIS schema, RLS, triggers, views, storage, cron |
| `supabase/functions` | Deno Edge Functions: `submit-report`, `screen-report`, `notify-status`, `weekly-digest` |
| `supabase/tests` | pgTAP tests for RLS, triggers and views |
| `supabase/seed` | Ward seed, OSM boundary fetcher, dev demo data |
| `workers/cases` | DGHS dengue bulletin scraper (daily) |
| `workers/satellite` | Sentinel-2/Landsat ward risk (weekly) |
| `workers/thumbs` | Face/number-plate blurring for public thumbnails of reports and volunteer after photos (every 5 min) |
| `workers/detector` | P3: YOLO classifier trained on moderator labels |
| `docs/` | [Deployment guide](docs/DEPLOYMENT.md), [Spec](docs/SPEC.md), [security review](docs/security-review-2026-10-01.md), [credits](docs/credits.md), [Bangla copy review](docs/copy-review.md), [operations: backup/restore, load test, monitoring](docs/operations.md) |
| `scripts/` | `loadtest.mjs` (reports/minute through the real pipeline), `copy-review.mjs` |

> **Full step-by-step guide with every setting explained: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).**

## Local setup (under 10 commands)

Needs Node 22, pnpm 10, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
git clone https://github.com/scornik/Dengue-Watch-BD && cd Dengue-Watch-BD
pnpm install
supabase start                                   # Postgres+PostGIS, Auth, Storage, Edge runtime
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed/dev_demo.sql   # optional demo data
cp supabase/functions/.env.example supabase/functions/.env
supabase functions serve --env-file supabase/functions/.env &
supabase status -o env | awk -F= '/^API_URL/{print "NEXT_PUBLIC_SUPABASE_URL="$2} /^ANON_KEY/{print "NEXT_PUBLIC_SUPABASE_ANON_KEY="$2}' | tr -d '"' > apps/web/.env.local
pnpm dev                                          # http://localhost:3000
```

Staff sign-in locally: invite yourself (`insert into staff_invites (email, role) values ('you@example.org','superadmin');` in psql), then sign in at `/staff/login`; the magic link arrives in Mailpit at http://127.0.0.1:54324.

### Checks

```bash
pnpm lint && pnpm typecheck && pnpm test          # web: ESLint, tsc, Vitest
supabase test db                                  # pgTAP: RLS, triggers, views
pnpm test:e2e                                     # Playwright, 360×740 Android viewport
cd workers/<name> && uv run --extra dev pytest    # each Python worker
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and PR, plus Lighthouse (mobile) on the main public pages: accessibility ≥ 95 is enforced, performance ≥ 90 is reported.

Quality bars measured locally (Lighthouse 13, mobile emulation, 2026-09-29): performance 95–99 and accessibility 100 on `/`, `/report`, `/map`, `/ward`, `/ward/[id]`, `/mine`, `/data`, `/about`. Report route initial JS: ~166 KB gzipped (budget 200 KB, enforced by an e2e test). Load test: 50 reports/min with p95 83 ms (see `docs/operations.md`).

## Configuration

Every variable is documented in [`.env.example`](.env.example). Summary:

| Where | Variables |
| --- | --- |
| Vercel (web) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_CLIP_MODEL_ID`, `NEXT_PUBLIC_SOURCE_URL` |
| Supabase function secrets | `DEVICE_HASH_SALT`, `ALLOWED_ORIGINS`, `OTP_REQUIRED_AFTER`, `PHONE_OTP_ENABLED`, `PAID_AI_ENABLED`, `VISION_PROVIDER`, `VISION_MODEL`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DETECTOR_URL`, `DETECTOR_TOKEN`, `AI_DAILY_CAP`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SITE_URL`, `RESEND_API_KEY`, `DIGEST_FROM` |
| Northflank (workers) | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, plus per-worker settings in each worker README |

The web app never receives a service-role key.

## Deployment

### Supabase

```bash
supabase link --project-ref <ref>
supabase db push                                   # apply migrations
psql "$DATABASE_URL" -f supabase/seed.sql          # 129 ward rows (idempotent)
DATABASE_URL=... bash supabase/seed/load_wards.sh  # ward boundaries (see supabase/seed/README.md)
supabase secrets set --env-file supabase/functions/.env.production
supabase functions deploy submit-report --no-verify-jwt
supabase functions deploy screen-report notify-status weekly-digest
```

In the dashboard: enable **Anonymous sign-ins** (Auth → Providers; required for hunters), set the Site URL and redirect URLs to your Vercel domain, and (optionally) configure an SMS provider for phone OTP.

#### Scheduled jobs

Migrations register pg_cron jobs (`notify-status` every 5 min, `screen-backlog` hourly, `weekly-digest` Monday 08:00 Asia/Dhaka). They call Edge Functions using two Vault secrets you create once:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

### Vercel

Import the repo, set **Root Directory** to `apps/web` (framework: Next.js; keep "Include files outside the root directory" on, since `/messages` lives at the repo root), and add the `NEXT_PUBLIC_*` variables above.

### Northflank

One **cron job** per worker, built from its Dockerfile (build context = the worker directory):

| Worker | Schedule (UTC) | Asia/Dhaka |
| --- | --- | --- |
| `workers/cases` | `0 4 * * *` | daily 10:00 |
| `workers/satellite` | `0 21 * * 0` | Monday 03:00 |
| `workers/thumbs` | `*/5 * * * *` | every 5 min |
| `workers/detector` | service (P3, optional) | — |

Environment variables per worker are listed in each worker's README.

## Open data

- `GET /api/export/sites.csv` and `GET /api/export/sites.geojson`: anonymised sites (points snapped to ~50 m, no reporter data), ODbL-1.0, cached 1 h.
- `GET /api/export/research.csv` with `Authorization: Bearer <researcher access token>`: report-level anonymised export (`research_reports` view).

## Weekly digest

Every Monday 08:00 Asia/Dhaka, `weekly-digest` emails each ward admin a per-ward summary (new, cleared, overdue sites, risk level) for their city corporation via Resend (set `RESEND_API_KEY`; otherwise it is only logged). The same digest is printable as PDF at `/staff/digest`.

## Photo screening (tiers)

1. **On-device (free, default):** blur/darkness check + zero-shot CLIP in a Web Worker (lazy, cached, skipped on weak devices). Never blocks submission.
2. **Rules (free):** rate limits (10/h, 30/day per device), duplicate merge (25 m, 7 days), phone OTP after 5 reports when an SMS provider is configured.
3. **Human (free):** moderator queue, pending/unclear first, keyboard shortcuts; every decision is saved as a training label.
4. **Paid API (optional, off):** `screen-report` Edge Function (Anthropic or Gemini) only for unclear/pending, hard daily cap, zod-validated JSON.
5. **Own model (P3):** `workers/detector` behind the same provider interface.

## Volunteer game

| What | Points |
| --- | --- |
| Report a spot | +5 (revoked if the report turns out not relevant) |
| Destroy a spot | +20, +10 if larvae were seen, +10 if open more than 3 days (+10 only if you reported it yourself) |

Report points arrive when a moderator verifies the spot (or approves its cleanup). Clean points show at once on the hunter's own card and reach the public leaderboard after 48 h unless a moderator reverses them. Claims last 3 hours. Limits grow with confirmed XP: new hunters hold 1 spot and destroy 3 a day, then 2/6, then 3/10. The after photo must be taken within 80 m of the spot's public (approximate) point. Hunters also get a weekly streak and a ward-vs-ward weekly board. Rules: `game_rules()` in `supabase/migrations/20260930000100_volunteer_game.sql`, mirrored in `apps/web/src/lib/game/rules.ts`. Moderators review "Cleanup proofs" in `/staff/moderate` and can reverse a fake one, which reopens the spot and takes the points back.

## Photos and compression

Photos are compressed on the phone before upload: ≤1024 px and ≤120 KB JPEG (avatars 256 px, ≤25 KB). Storage limits: `report-photos` and `after-photos` 2 MB, `cleanup-photos` 512 KB, `avatars` 128 KB (public). Public thumbnails are 320 px, quality 50.

## Privacy

EXIF is stripped from every stored photo (GPS is kept only in the `geom` column). Public thumbnails are created only after faces and number plates are blurred; if blurring fails, nothing is published. Public points are snapped to ~50 m. Reporter identity is never shown; hunters appear only under the name and photo they chose.

## License

[AGPL-3.0-only](LICENSE). Credits for ideas, data and methods: [`docs/credits.md`](docs/credits.md).
