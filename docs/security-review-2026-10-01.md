# Security review, 2026-10-01 (before public launch)

Method: the [claude-security](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security) plugin's approach, run with ordinary agents because the plugin was not enabled in the session. Four read-only researchers each took one component (database, edge functions, web app, workers + CI), and an independent verifier then tried to disprove every finding. Dependencies were checked with `pnpm audit` and `pip-audit` (no known vulnerabilities).

All findings below are fixed unless marked otherwise.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | HIGH | Staff invite was applied on sign-up even when the email was not confirmed, so anyone knowing an invited address could sign up with a password and become staff | Invites apply only when `email_confirmed_at` is set (`handle_new_user`, `handle_user_updated`) |
| 2 | MEDIUM | Volunteer clean-ups trusted the client GPS, and the public (snapped) point always passed the 50 m check, so sites could be "cleared" remotely with a reused photo | One fresh photo per claim (`<uid>/<claim>.jpg`, uploaded after claiming, enforced by storage policy and RPC); trust tiers (new hunters: 1 claim, 3 cleans/day); clean points "confirm" for 48 h; moderators review every unreviewed cleanup (approve or reverse). Residual: a determined attacker with many accounts can still fake cleanups until a moderator reverses them; that trade-off is what keeps volunteers from waiting on moderators |
| 3 | MEDIUM | `complete_cleanup` answered too_far / daily_limit against the exact location, which allowed finding a reporter's exact (home) location by repeated probing | Distance is now checked against the public snapped point (80 m), and limits are checked first. The RPC reveals nothing that is not already public |
| 4 | MEDIUM | Leaderboard report counts updated the moment a report arrived, so a hunter name could be matched to the site they reported | Report points are earned when a moderator verifies the site (or approves its cleanup) and reach the public board in a daily batch |
| 5 | MEDIUM | Report rate limit was keyed only on a client-chosen device id (unlimited reports and report points) | `submit-report` requires a (possibly anonymous) sign-in; per-reporter limits in the database (10/h, 30/day) |
| 6 | MEDIUM | Thumbnail worker decoded images before checking their size (decompression bomb could OOM the job and block all thumbnails) | Header size check before decode, JPEG draft decoding, 40 MP cap, rows marked before processing so a crash fails closed |
| 7 | LOW | Mass-claiming to lock spots away from volunteers | Tiered claim limits plus a daily cap on claims |
| 8 | LOW | Ward admins could reject cleanups in another city corporation | Review is ward-scoped (`can_review_cleanup`) |
| 9 | LOW | Unlimited uploads to the public `avatars` bucket; avatar path could contain `../` | Avatars only for hunters, fixed name pattern, 10 per person, JPEG only; path checked by policy and constraint |
| 10 | LOW | JPEG metadata stripper kept data after the first scan (trailers, metadata between progressive scans) | Stripper walks every scan, drops APP1–15/COM everywhere and stops at EOI |
| 11 | LOW | Web push sent to any URL a user stored (blind SSRF, no timeout) | Endpoint allow-list (code and DB constraint), 8 s timeout, batched sends |
| 12 | LOW | Rejected cleanup thumbnails stayed public | Worker deletes them |
| 13 | LOW | Case scraper followed off-site PDFs and redirects to any host | Same-host or allow-listed hosts only, redirects checked per hop, 20 MB cap |
| 14 | LOW | CI: default token permissions, unpinned tool versions | `permissions: contents: read`, pinned Supabase CLI and `wait-on` |
| — | Intended | Spot photos are public once blurred, before a moderator sees them | Product decision (DECISIONS.md, "Volunteer game + redesign"); blurring still fails closed |
| — | Open | No Content-Security-Policy yet | Tracked in DECISIONS.md (M9) |

Checked and found safe (summary): RLS on every table and column-level profile grants; every `security definer` function uses `auth.uid()` and an empty `search_path`; no service-role key in the web app; map popups and all user text rendered as text (no HTML sinks); PostgREST filters only take validated ids; export routes; service worker caching; CSV formula escaping; magic-link redirect; detector SSRF guard and token check; workers parameterise all SQL and run as non-root.
