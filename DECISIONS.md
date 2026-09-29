# Decisions

Autonomous build log. Each entry: date · decision · reason. Newest at the bottom of each milestone.

## M0 — Setup

- **2026-09-29 · pnpm workspace with a single Next.js app (`apps/web`), no Turborepo.** One JS package does not need a task runner; root scripts delegate with `pnpm --filter web`.
- **2026-09-29 · Next.js 16 (App Router) with `proxy.ts` instead of `middleware.ts`.** Next 16 renamed middleware to proxy; only next-intl routing runs there.
- **2026-09-29 · next-intl with `localePrefix: "as-needed"`: Bangla at `/`, English at `/en`, no browser-language detection.** Bangla must be the default for everyone (many phones are set to English); URLs stay short for WhatsApp sharing, and pages can be statically rendered.
- **2026-09-29 · `/messages/{bn,en}.json` at the repo root** (per the agent prompt). `next.config.ts` sets `outputFileTracingRoot`/`turbopack.root` to the repo root so the app can import them. On Vercel keep "Include files outside the root directory" enabled (default).
- **2026-09-29 · Self-hosted Noto Sans Bengali via `@fontsource`** instead of `next/font/google`. Works offline in the PWA, no build-time Google Fonts fetch; the unicode-range split means Latin pages don't download Bengali glyphs.
- **2026-09-29 · Hand-written service worker (`public/sw.js`) instead of next-pwa/Serwist.** It is ~200 lines, has no build step, and we need custom Background Sync + push logic anyway.
- **2026-09-29 · The web app never holds a service-role key.** Browser uses the anon key + RLS; privileged work runs in Supabase Edge Functions or workers. Staff invites are rows in `staff_invites` that a trigger applies on first sign-in, so no admin API is needed from Vercel.
- **2026-09-29 · Playwright runs one project: Pixel 5 profile at 360×740.** The definition of done targets low-end Android Chrome. `PW_CHROMIUM_PATH` lets sandboxes use a preinstalled Chromium.

## M1 — Schema + seed

- **2026-09-29 · Ward ids are deterministic: DNCC ward n → n, DSCC ward n → 100 + n.** Workers, seeds and GeoJSON uploads can refer to wards without lookups.
- **2026-09-29 · `wards.geom` is nullable.** Ward rows (names, numbers) exist from day one; boundaries are loaded later. Reports outside every known polygon get `ward_id = null` and are backfilled when a boundary is uploaded (`upsert_wards_geojson`).
- **2026-09-29 · Ward boundary gap: the committed `supabase/seed/wards.geojson` is an empty FeatureCollection.** Overpass (overpass-api.de) and other OSM mirrors were not reachable from the build sandbox (egress policy), so the fetch could not run here. `supabase/seed/fetch_wards.py` does the Overpass query and polygon assembly and prints which wards are missing; `/admin/wards` accepts any GeoJSON (e.g. official DNCC/DSCC boundaries) for gaps. Action for maintainers: run the script from a normal network, review, commit.
- **2026-09-29 · Citizens do not insert into `reports` directly; the `submit-report` Edge Function does (service role).** The function must strip EXIF and store the photo anyway, and a direct PostgREST insert would allow forged `photo_path`s. Anonymous users therefore "insert reports" only through that function. Rate limits (10/hour, 30/day per `device_hash`) are enforced twice: in the function (friendly 429) and in a `BEFORE INSERT` trigger (errcode `P0429`) so no path can bypass them.
- **2026-09-29 · Citizens use Supabase anonymous sign-in.** Gives every reporter a stable `reporter_id` (to track their own reports and receive push) without collecting identity. Phone OTP can later be linked to the same user.
- **2026-09-29 · `device_hash` = SHA-256(random per-install id + server salt), computed server-side.** The raw id never reaches the database; the salt (`DEVICE_HASH_SALT`) stops cross-referencing.
- **2026-09-29 · Duplicate merge is serialised with a transaction-scoped advisory lock.** Two simultaneous reports of the same spot would otherwise both create a site. At the target load (50 reports/minute) a single lock is negligible.
- **2026-09-29 · Site state machine enforced in a `BEFORE UPDATE` trigger with a role × transition matrix (`site_transition_allowed`).** RLS decides *which rows* a role may update; the trigger decides *which transitions*, and enforces "cleared needs an after photo taken within 50 m" (`after_photo_geom`) and "not_found needs a reason" for everyone, including the service role.
- **2026-09-29 · Moderation and merge are `security definer` RPCs (`moderate_report`, `merge_sites`) with explicit role checks.** They touch reports, sites and `ai_labels` atomically; statements they run count as "system" in the state-machine trigger. Every moderator decision writes `ai_labels.moderator_label` (the site type for approvals, `not_relevant` for rejections) as training data for P3.
- **2026-09-29 · `site_events` is append-only via trigger (no UPDATE/DELETE, even for the owner) except stamping `notified_at`.** The notifier needs to mark events as pushed; all audit columns are immutable.
- **2026-09-29 · Public data only through owner-rights views (`public_sites`, `public_wards`, `public_ward_scorecard`, `public_case_counts`, `public_ward_risk`) and two GeoJSON RPCs.** Tables stay closed to `anon`. `public_sites` snaps points with `ST_SnapToGrid(geom, 0.0005)` (~55 m N–S, ~51 m E–W at Dhaka's latitude), hides rejected/merged sites and shows a thumbnail only after blurring succeeded.
- **2026-09-29 · Scorecard % cleared within 72 h excludes open sites younger than 72 h from the denominator.** Otherwise a ward that received many reports yesterday would look worse than it is.
- **2026-09-29 · Researchers: an anonymised report-level view (`research_reports`) gated by role, not a separate API-key system.** Researchers sign in with email like other staff and use their session token with the REST API or the export page. Keys are salted hashes of ids; no reporter, device, note or photo columns.
- **2026-09-29 · Case counts `area` uses codes (`DNCC`, `DSCC`, `DHAKA_DIV`, …, `BANGLADESH`).** Stable keys across Bangla/English bulletins; manual entries (`entered_by` not null) are never overwritten by the scraper.
- **2026-09-29 · Scheduled jobs use pg_cron + pg_net calling Edge Functions with Vault secrets (`project_url`, `service_role_key`).** No secrets in migrations; jobs are no-ops until the operator creates the secrets.
- **2026-09-29 · RLS tests use pgTAP via `supabase test db`.** Runs against the real migrations in CI.
- **2026-09-29 · Admin ward upload goes through the same `upsert_wards_geojson` RPC as the seed script, with client-side validation first (`src/lib/geojson.ts`).** One code path for OSM and official boundaries; ward admins can only load their own city corporation.
- **2026-09-29 · `supabase/seed/dev_demo.sql` draws a synthetic ward grid (`geom_source = 'synthetic-demo'`) and fake reports for local dev and CI e2e only.** Lets the map, scorecards and queues be exercised without real boundaries; clearly labelled and never part of `seed.sql`.
