# DengueWatch BD: local setup and production deployment

This guide takes you from a fresh laptop to a running local copy, and then to a public production deployment. It explains what each setting does and why, so you can make changes safely later.

- Part 1: [How the pieces fit](#part-1-how-the-pieces-fit)
- Part 2: [Run it locally](#part-2-run-it-locally)
- Part 3: [Deploy to production](#part-3-deploy-to-production)
- Part 4: [Every setting explained](#part-4-every-setting-explained)
- Part 5: [Updating, monitoring, troubleshooting](#part-5-updating-monitoring-troubleshooting)

---

## Part 1: How the pieces fit

| Piece | What it does | Where it runs | Cost |
| --- | --- | --- | --- |
| **Web app** (`apps/web`) | The PWA citizens, hunters and staff use. Next.js. | Vercel (or any Node host) | Free tier possible |
| **Database, auth, file storage** | Postgres + PostGIS, row-level security, anonymous and email sign-in, photo buckets | Supabase | Free tier for trying; Pro recommended for launch |
| **Edge Functions** (`supabase/functions`) | `submit-report` (receives reports), `screen-report` (optional AI screening), `notify-status` (web push), `weekly-digest` (email) | Supabase | Included |
| **Scheduled jobs inside the database** | pg_cron calls the Edge Functions on a schedule | Supabase | Included |
| **Workers** (`workers/*`) | `thumbs` (blurs faces and number plates before photos go public), `cases` (official DGHS case numbers), `satellite` (weekly ward risk), `detector` (optional self-hosted photo classifier) | Northflank (any Docker cron host works); `satellite` on GitHub Actions | Small monthly cost (`satellite` free) |
| **Email** | Staff sign-in codes, hunter email codes, weekly digest | Resend via SMTP and API | Free tier |
| **Map tiles** | Base map | OpenFreeMap | Free, no key |

What the browser can see: only the Supabase URL and the **anon (publishable) key**. Row-level security in the database protects all data. The **service-role key** bypasses security and lives only in Edge Function secrets and worker secrets, never in the web app.

---

## Part 2: Run it locally

### 2.1 Install the tools (macOS)

| Tool | Why | Install |
| --- | --- | --- |
| Xcode Command Line Tools | compilers Homebrew needs | `xcode-select --install` |
| Homebrew | package manager | https://brew.sh |
| Node 22 | runs the web app | `brew install node@22` |
| pnpm 10 | installs JS packages | `corepack enable && corepack prepare pnpm@10 --activate` |
| Docker Desktop | runs the local Supabase stack | https://www.docker.com/products/docker-desktop |
| Supabase CLI | starts and manages Supabase | `brew install supabase/tap/supabase` |
| psql | runs SQL files | `brew install libpq && brew link --force libpq` |
| uv (optional) | runs the Python workers and their tests | `brew install uv` |

If Homebrew says the Command Line Tools are outdated (common after a macOS upgrade), run `sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install`.

### 2.2 Get the code and install packages

```bash
git clone https://github.com/scornik/Dengue-Watch-BD.git
cd Dengue-Watch-BD
pnpm install
```

### 2.3 Start Supabase locally

Start Docker Desktop first, then:

```bash
supabase start
```

The first run downloads the images (a few minutes). It then prints local URLs and keys. These are fixed demo keys, safe only on your machine. It also:

- applies every migration in `supabase/migrations/` (tables, security rules, functions, buckets, scheduled jobs),
- runs `supabase/seed.sql` (the 129 Dhaka wards, without boundaries).

Useful local addresses:

| Address | What |
| --- | --- |
| http://127.0.0.1:54321 | Supabase API (what the app talks to) |
| http://127.0.0.1:54323 | Supabase Studio (database browser) |
| http://127.0.0.1:54324 | Mailpit: every email sent locally lands here (staff sign-in codes) |
| postgresql://postgres:postgres@127.0.0.1:54322/postgres | Database, for psql |

### 2.4 Optional demo data

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed/dev_demo.sql
```

This adds a synthetic ward grid (not real boundaries), 160 fake reports, demo hunters, risk scores and case numbers, so every page has something to show. Never load it in production.

### 2.5 Edge Functions

```bash
cp supabase/functions/.env.example supabase/functions/.env
supabase functions serve --env-file supabase/functions/.env
```

Leave this running in its own terminal. The example file is ready for local use: AI screening off, CORS open, no email or push keys.

### 2.6 Web app

In a new terminal, from the repo root:

```bash
supabase status -o env \
  | awk -F= '/^API_URL/{print "NEXT_PUBLIC_SUPABASE_URL="$2} /^ANON_KEY/{print "NEXT_PUBLIC_SUPABASE_ANON_KEY="$2}' \
  | tr -d '"' > apps/web/.env.local
echo "NEXT_PUBLIC_SITE_URL=http://localhost:3000" >> apps/web/.env.local
pnpm dev
```

Open http://localhost:3000 (Bangla) or http://localhost:3000/en (English).

### 2.7 Sign in as staff locally

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "insert into staff_invites (email, role) values ('you@example.org', 'superadmin');"
```

Open http://localhost:3000/staff/login, enter that email, then open Mailpit (http://127.0.0.1:54324). Use the link or the 6-digit code. The invite only applies once the email is confirmed, which signing in this way does.

Roles: `moderator` (reviews reports and cleanups), `inspector` (closes sites in one ward; set `ward_id`), `ward_admin` (one city corporation; set `city_corp` to `DNCC` or `DSCC`), `researcher` (anonymised export), `superadmin` (everything).

### 2.8 Run the checks

```bash
pnpm lint && pnpm typecheck && pnpm test        # web
supabase test db                                # database security tests (on a clean DB: run `supabase db reset` first)
pnpm test:e2e                                   # browser tests at phone size (needs functions running)
cd workers/thumbs && uv run --extra dev pytest  # each Python worker the same way
```

### 2.9 Local problems we have hit

| Symptom | Fix |
| --- | --- |
| `zsh: command not found: psql` | `brew install libpq && brew link --force libpq`, then open a new terminal |
| `pnpm dev` fails with `dyld: Library not loaded ... libsimdutf` | Homebrew's Node lost a library after an upgrade: `brew upgrade && brew reinstall node@22` |
| Reports fail with "sign in required" | Anonymous sign-ins must be on: `supabase stop && supabase start` (it reads `supabase/config.toml`, which enables them) |
| Map shows no ward shapes | Ward boundaries are not loaded; see 3.2.4 |

---

## Part 3: Deploy to production

Do the steps in order: Supabase, then the web app, then the workers, then the final checks. Write each secret into a password manager as you create it.

### 3.1 Accounts and choices

| Service | Plan advice |
| --- | --- |
| Supabase | Free plan for a trial. Free projects pause after about a week without traffic and have small limits, so use **Pro** for the public launch (daily backups, no pausing). Choose region **Southeast Asia (Singapore)**, the closest to Dhaka. |
| Vercel | Hobby is for non-commercial personal use. For an organisation's public service use Pro, or deploy the same app to Netlify, Cloudflare or any Node host. |
| Northflank | Runs the Docker workers on a schedule. Small plans are enough (see 3.4). |
| Resend | Free tier is enough for staff codes and weekly digests. You need a domain you control to send from. |
| Domain | e.g. `denguewatch.org.bd` for the app and `mail.denguewatch.org.bd` for sending email. |

Check current prices and limits on each provider's site; they change.

### 3.2 Supabase

#### 3.2.1 Create and link the project

1. Supabase dashboard → New project → name `denguewatch-bd`, region Singapore, a strong database password (save it).
2. On your laptop:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # the ref is in the project URL: https://<ref>.supabase.co
```

#### 3.2.2 Create the database

```bash
supabase db push
```

This applies every migration in order and creates all tables, security policies, functions, storage buckets and scheduled jobs. Run it again after every update that adds a migration; it only applies new ones.

Then load the ward list (names only, safe to re-run):

```bash
psql "<connection string>" -f supabase/seed.sql
```

The connection string is under Project → Connect. Use the **Session pooler** string (port 5432). It works over IPv4, which most networks and Northflank need.

#### 3.2.3 Authentication settings (dashboard → Authentication)

| Setting | Value | Why |
| --- | --- | --- |
| Sign In / Providers → **Anonymous sign-ins** | On | Every citizen gets an invisible account; it is required to send reports and to play |
| Sign In / Providers → Email → **Confirm email** | On | Staff invites only apply to confirmed emails; this closes the sign-up path entirely |
| Sign In / Providers → Phone | Off for now | SMS costs money and the app has no phone-verify screen yet; repeat reporters go to moderators instead |
| URL Configuration → **Site URL** | `https://<your domain>` | Where email links send people |
| URL Configuration → **Redirect URLs** | `https://<your domain>/**` (add the Vercel URL too while testing) | Staff sign-in links may only return to these addresses |
| Emails → **SMTP Settings** | Resend: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender `DengueWatch BD <no-reply@mail.<domain>>` | Supabase's built-in email is for testing only: very few emails per hour, and on new projects only to your own team. Real users would never get their codes. |
| Emails → Templates → **Magic Link** | Add `Your code: {{ .Token }}` next to the link | Staff can type the code on a different device |
| Emails → Templates → **Change Email Address** | Add `Your code: {{ .Token }}` | The hunter "Keep your progress" screen asks for the 6-digit code |
| Rate Limits | keep defaults (anonymous sign-ups are limited per IP) | Slows down mass fake accounts |

In Resend: add and verify your sending domain (add the DNS records it shows) before testing email.

#### 3.2.4 Ward boundaries

The map needs real ward shapes. The committed `supabase/seed/wards.geojson` already holds all 129 wards (DGHS source, see `DECISIONS.md`); load it:

```bash
DATABASE_URL="<session pooler connection string>" bash supabase/seed/load_wards.sh
```

To refresh it from source:

- **DGHS** (recommended, complete): `uv run --with shapely --with requests python supabase/seed/fetch_wards_dghs.py`
- **OpenStreetMap**: `uv run --with shapely --with requests python supabase/seed/fetch_wards.py`. It prints which wards it could not find; in October 2026 OSM had no usable Dhaka ward relations.
- **Official files** from DNCC/DSCC: sign in as superadmin and upload the GeoJSON on `/staff/admin`. Each feature needs `city_corp` (`DNCC` or `DSCC`) and `ward_no`.

#### 3.2.5 Edge Function secrets

Create a file `supabase/functions/.env.production`. It is git-ignored; never commit it. Every value is explained in [Part 4](#part-4-every-setting-explained).

```bash
# generate the random values first
openssl rand -hex 32                 # -> DEVICE_HASH_SALT
npx web-push generate-vapid-keys     # -> VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

```dotenv
DEVICE_HASH_SALT=<64 hex characters>
ALLOWED_ORIGINS=https://denguewatch.org.bd,https://www.denguewatch.org.bd
OTP_REQUIRED_AFTER=5
PHONE_OTP_ENABLED=false
PAID_AI_ENABLED=false
VISION_PROVIDER=model
DETECTOR_URL=
DETECTOR_TOKEN=
AI_DAILY_CAP=100
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:team@denguewatch.org.bd
SITE_URL=https://denguewatch.org.bd
RESEND_API_KEY=<Resend API key>
DIGEST_FROM=DengueWatch BD <digest@mail.denguewatch.org.bd>
SUPPORT_NOTIFY_TO=ashik.elahi.cse@gmail.com
SUPPORT_FROM=DengueWatch BD <support@mail.denguewatch.org.bd>
```

```bash
supabase secrets set --env-file supabase/functions/.env.production
supabase secrets list            # shows names only, never values
```

You can also set them one by one in the dashboard: Edge Functions → Secrets. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically; do not set them.

#### 3.2.6 Deploy the functions

```bash
supabase functions deploy submit-report --no-verify-jwt --import-map supabase/functions/deno.json
supabase functions deploy screen-report notify-status weekly-digest notify-support --import-map supabase/functions/deno.json
```

`--import-map` is needed because the shared `deno.json` sits in `supabase/functions/`, not in each function folder; without it the bundler fails with `Relative import path "@supabase/supabase-js" not prefixed with / or ./ or ../`. Add `--use-api` if Docker is not running.

`submit-report` is deployed with `--no-verify-jwt` so the offline queue can always reach it. The function checks the user's sign-in itself and refuses requests without one. The other four only accept the service-role key, which only the scheduled jobs have.

#### 3.2.7 Let the scheduled jobs call the functions

The migrations created pg_cron jobs:

| Job | When (Asia/Dhaka) | Calls |
| --- | --- | --- |
| `notify-status` | every 5 minutes | push notifications when a reported site changes status |
| `screen-backlog` | hourly | `screen-report` for unscreened photos (does nothing while `PAID_AI_ENABLED=false`) |
| `weekly-digest` | Monday 08:00 | ward admin digest emails |

They need two secrets stored in Supabase Vault. Run this once in the SQL editor:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role key from Project Settings → API>', 'service_role_key');
```

Check they run: `select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) order by d.start_time desc limit 10;` and, for the function's answer, `select status_code, content, created from net._http_response order by created desc limit 5;` (a 403 means the Vault `service_role_key` is not the project's service-role key: use the legacy `service_role` JWT from Project Settings → API, since the functions run with JWT verification and accept a verified `service_role` token)

#### 3.2.8 Create the first superadmin

In the SQL editor:

```sql
insert into staff_invites (email, role) values ('you@yourdomain.org', 'superadmin');
```

After the web app is live, sign in at `/staff/login`. Invite everyone else from `/staff/admin`.

### 3.3 Web app (Vercel)

1. Vercel → Add New → Project → import the GitHub repo.
2. **Root Directory**: `apps/web`. Framework: Next.js. Keep "Include files outside the root directory" on, because the translations live in `/messages`.
3. Environment variables (Production):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon / publishable key |
   | `NEXT_PUBLIC_SITE_URL` | `https://denguewatch.org.bd` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the same public key as in the function secrets |
   | `NEXT_PUBLIC_MAP_STYLE_URL` | leave empty (OpenFreeMap) or your own style URL |
   | `NEXT_PUBLIC_CLIP_MODEL_ID` | leave empty (default `Xenova/clip-vit-base-patch32`) |
   | `NEXT_PUBLIC_SOURCE_URL` | `https://github.com/scornik/Dengue-Watch-BD` (AGPL asks you to offer the source) |

   Never add the service-role key here.
4. Deploy, then Settings → Domains → add your domain and follow the DNS instructions.
5. Go back and make sure these use the final domain: `ALLOWED_ORIGINS` and `SITE_URL` (function secrets; re-run `supabase secrets set`), and Site URL / Redirect URLs (Supabase auth).

### 3.4 Workers (Northflank)

1. Northflank → create a project → **Secret group** `denguewatch-workers` containing:
   - `DATABASE_URL`: Session pooler connection string (port 5432)
   - `SUPABASE_URL`: `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: from Project Settings → API
2. For each worker create a **Cron job** from the GitHub repo. Build with the Dockerfile; set the build context to the worker folder. Each folder has a `northflank.json` with the exact settings.

| Job | Dockerfile | Command | Schedule (UTC) | Plan | Extra variables |
| --- | --- | --- | --- | --- | --- |
| `thumbs-5min` | `workers/thumbs/Dockerfile` | `python -m thumbs.main` | `*/5 * * * *` | 512 MB | `BATCH_SIZE=50` |
| `cases-daily` | `workers/cases/Dockerfile` | `python -m cases.main` | `0 4 * * *` (10:00 Dhaka) | small | `CASES_ALLOWED_HOSTS=dghs.gov.bd` |

Set concurrency to "forbid" so two runs never overlap.

**`satellite` runs on GitHub Actions, not Northflank** (`.github/workflows/satellite-weekly.yml`). It needs about 4 GB RAM, more than Northflank's free allowance, while GitHub's standard runner has 16 GB and is free for a public repository. Setup: repository Settings → Secrets and variables → Actions → New repository secret `DATABASE_URL` = the Session pooler string (port 5432). It runs every Monday 03:00 Dhaka (`0 21 * * 0` UTC); run it by hand from Actions → "Satellite weekly ward risk" → Run workflow (optional week and dry run). Network failures are retried twice. GitHub may start scheduled runs a few minutes late, and disables schedules in a public repository after 60 days without commits: re-enable it on the Actions page. To run it on Northflank instead (paid plan), `workers/satellite/northflank.json` still has the settings.

Through the API, the GitHub source goes in `vcsData` (`projectUrl`, `projectType`, `projectBranch`, `accountLogin`) together with the Dockerfile path; and job descriptions may not contain `>`.

**`thumbs` is required.** Without it no photo ever becomes public. The face-detection model is baked into its image at build time. It fails closed: if a photo cannot be checked, it is never published.

`detector` is optional; see [Vision provider](#vision-provider-ai-photo-screening).

### 3.5 Final checks (smoke test)

On a real Android phone, on mobile data:

1. Open the site → install it to the home screen.
2. Report a spot with a photo. You should see "Thank you" and "+5 XP when a moderator checks it".
3. Within about 5 minutes the spot shows on `/sites` with a blurred photo (that is the `thumbs` worker).
4. As a moderator (`/staff/moderate`), approve the report.
5. As a second phone: pick a hunter name, claim the spot, take the after photo at the spot, confirm. You should see the celebration.
6. As the moderator: Cleanup proofs → "Looks right".
7. "Keep your progress" on `/me`: the email code arrives (this proves SMTP and templates work).
8. Check `/map`, `/ward`, `/leaderboard`.

---

## Part 4: Every setting explained

### ALLOWED_ORIGINS (CORS)

**What it is.** The citizen's browser sends reports directly to the `submit-report` Edge Function, which lives on a different address (`<ref>.supabase.co`) than your site. Browsers only let a page read the reply from another address if that address says the page's origin is allowed. That permission is CORS. `ALLOWED_ORIGINS` is the list of site addresses the function will answer.

**How to set it.**

- A comma-separated list of exact origins: scheme + host (+ port if not standard). No path, no trailing slash.
  - Right: `https://denguewatch.org.bd,https://www.denguewatch.org.bd`
  - Wrong: `denguewatch.org.bd` (no scheme), `https://denguewatch.org.bd/` (trailing slash)
- While testing on Vercel, add the Vercel address too, e.g. `https://dengue-watch-bd.vercel.app`. Each Vercel preview deployment has a different address, so test previews against a separate staging Supabase project, or temporarily add the preview address.
- Locally it is `*` (allow everything), which is fine on your laptop only.
- Set it with `supabase secrets set ALLOWED_ORIGINS=https://...` or in the dashboard (Edge Functions → Secrets). Functions pick up new secret values without redeploying.

**What it is not.** CORS only stops *other websites* from using your function from a visitor's browser. It does not stop scripts or apps. Those are handled by sign-in, per-reporter limits and moderation.

**Symptom when wrong:** reports stay "Waiting to upload", and the browser console shows a CORS error.

### Vision provider (AI photo screening)

Photo screening has tiers. The free tiers are on by default and are enough for launch:

| Tier | What | Cost | On by default |
| --- | --- | --- | --- |
| 1. On the phone | Blur/darkness check, then an open-source zero-shot model (OpenAI CLIP, MIT licence, via Transformers.js) runs in the browser and suggests "likely / unclear / not relevant" | Free (runs on the user's phone) | Yes |
| 2. Rules | Rate limits, duplicate merging, repeat reporters sent to moderators | Free | Yes |
| 3. Humans | Moderator queue; every decision becomes a training label | Free | Yes |
| 4. Server AI | `screen-report` asks a vision model about photos tiers 1 to 3 left unclear | Depends on provider | **No** (`PAID_AI_ENABLED=false`) |
| 5. Own model | `workers/detector`: our own open-source classifier trained on the moderators' labels | Free software, you pay only for the server | Later |

`VISION_PROVIDER` chooses which service tier 4 uses. It is only read when `PAID_AI_ENABLED=true`. The name is historical: it is the on/off switch for *server-side* screening of any kind, including the free self-hosted model.

| `VISION_PROVIDER` | Service | Licence / cost | Notes |
| --- | --- | --- | --- |
| `model` | `workers/detector`: YOLO image classifier (Ultralytics, AGPL-3.0), self-hosted | Open source; you pay only for the server | **Recommended.** Needs training data first (below). Photos never leave your servers. |
| `gemini` | Google Gemini API | Has a free quota, otherwise paid | On the free quota Google may use submitted content to improve its products. Avoid for citizen photos. |
| `anthropic` | Claude API | Paid per photo | Hard daily cap `AI_DAILY_CAP` |

**Recommended path (free and open source):**

1. **Launch** with `PAID_AI_ENABLED=false` and `VISION_PROVIDER=model`. Screening = phone model + rules + moderators. Nothing to pay, nothing to host.
2. **When moderators have labelled about 1,000 to 2,000 photos** (a few weeks of use), train the detector (`workers/detector/README.md`):

   ```bash
   cd workers/detector
   uv sync && uv pip install -r requirements-train.txt
   uv run python -m detector.export_dataset --out data/dataset --val-pct 20
   uv run python -m detector.train --data data/dataset --model yolo11n-cls.pt --epochs 50
   ```

   A laptop CPU is enough for this small model (it takes longer); a GPU is faster.
3. Deploy `detector-api` on Northflank (`workers/detector/northflank.json`, about 2 GB RAM). Upload `best.pt` to its volume and set `DETECTOR_TOKEN` to a long random string (`openssl rand -hex 32`).
4. Set `DETECTOR_URL=https://<detector address>`, the same `DETECTOR_TOKEN`, and `PAID_AI_ENABLED=true` in the function secrets. Keep `AI_DAILY_CAP` as a safety limit.
5. Only switch on once the model beats the phone model on held-out Dhaka photos (the project's P3 exit rule).

### All Edge Function secrets

| Secret | Required | Example / default | What it does |
| --- | --- | --- | --- |
| `DEVICE_HASH_SALT` | **Yes** | 64 random hex chars | Device ids are stored only as `sha256(id + salt)`, so the database never holds raw device ids. Changing it resets per-device limits. |
| `ALLOWED_ORIGINS` | **Yes** | `https://your.domain` | See above |
| `SITE_URL` | **Yes** | `https://your.domain` | Links inside push notifications and digest emails |
| `SUPPORT_NOTIFY_TO` | No | `you@example.com, teammate@example.com` | Who is emailed for every new contact-form message (needs `RESEND_API_KEY`). Without it, messages only wait in `/staff/inbox` |
| `SUPPORT_FROM` | No | `DengueWatch BD <support@your.domain>` | Sender of those emails; defaults to `DIGEST_FROM` |
| `OTP_REQUIRED_AFTER` | No | `5` | After this many reports without a verified phone, reports go to moderators first (or are blocked if phone OTP is on) |
| `PHONE_OTP_ENABLED` | No | `false` | Keep `false`: needs an SMS provider and a phone-verify screen that does not exist yet |
| `PAID_AI_ENABLED` | No | `false` | Server-side screening on/off (see above) |
| `VISION_PROVIDER` | No | `model` | `model`, `gemini` or `anthropic` |
| `DETECTOR_URL`, `DETECTOR_TOKEN` | For `model` | | Self-hosted detector address and its bearer token |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | For `gemini` | `gemini-2.5-flash` | |
| `ANTHROPIC_API_KEY`, `VISION_MODEL` | For `anthropic` | `claude-haiku-4-5-20251001` | |
| `AI_DAILY_CAP` | No | `100` | Hard limit on server screening calls per Dhaka day |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | For push | from `npx web-push generate-vapid-keys` | Signs web push notifications. The public key also goes to the web app. |
| `VAPID_SUBJECT` | For push | `mailto:team@your.domain` | Contact address push services can use |
| `RESEND_API_KEY` | For digest email | | Without it the digest is only stored and logged (still printable at `/staff/digest`) |
| `DIGEST_FROM` | For digest email | `DengueWatch BD <digest@mail.your.domain>` | Must use a domain verified in Resend |

### Worker variables

| Variable | Workers | What |
| --- | --- | --- |
| `DATABASE_URL` | all | Postgres connection, **Session pooler** (port 5432) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | thumbs, detector | Storage access (download private photos, upload blurred thumbnails) |
| `BATCH_SIZE`, `FACE_SCORE_THRESHOLD` | thumbs | Photos per run (50) and face detector sensitivity (0.6; lower blurs more) |
| `CASES_SOURCE_URLS`, `CASES_ALLOWED_HOSTS` | cases | Bulletin pages to read; hosts it may follow links to (default `dghs.gov.bd`) |
| `LOOKBACK_DAYS`, `MAX_CLOUD_COVER` | satellite | Satellite image window (60 days) and cloud limit (40 %) |
| `DETECTOR_TOKEN`, `DETECTOR_WEIGHTS` | detector | Bearer token; path to `best.pt` |

---

## Part 5: Updating, monitoring, troubleshooting

### Shipping an update

```bash
git pull
supabase db push                                   # new migrations, if any
supabase functions deploy submit-report --no-verify-jwt --import-map supabase/functions/deno.json
supabase functions deploy screen-report notify-status weekly-digest notify-support --import-map supabase/functions/deno.json
```

Vercel and Northflank rebuild automatically from `main`. Read `DECISIONS.md` for anything that changes behaviour.

### What to watch

See `docs/operations.md` for backups, restore and the monitoring checklist. Short version:

- Northflank: failed `thumbs` runs mean photos are not going public.
- `select thumb_status, count(*) from reports group by 1;` → many `failed` usually means the face model is missing from the image.
- `/staff/moderate`: report and cleanup-proof queues.
- `select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) order by d.start_time desc limit 20;`

### Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Reports stuck "Waiting to upload", CORS error in console | `ALLOWED_ORIGINS` misses the site's exact origin | Fix the list (scheme, no trailing slash) |
| "sign in required" when reporting | Anonymous sign-ins off | Turn on in Authentication → Providers |
| Staff or hunter emails never arrive | Built-in email used, or domain not verified | Set custom SMTP, verify the domain in Resend |
| Email arrives but has no code | Template only has the link | Add `{{ .Token }}` to the template |
| Photos never appear publicly | `thumbs` not running, or wrong service key | Check Northflank logs |
| Push notifications never arrive | VAPID keys missing or mismatched, or Vault secrets missing | Same public key in web and functions; create the Vault secrets |
| Weekly digest not emailed | No `RESEND_API_KEY` | Add it, or print from `/staff/digest` |
| Map has no ward shapes | Boundaries not loaded | Section 3.2.4 |
| A volunteer says their XP is not on the leaderboard | Clean points are public after 48 h (or moderator approval); report points after a moderator verifies the spot, from the next day | Expected; approve in Cleanup proofs to speed up |
