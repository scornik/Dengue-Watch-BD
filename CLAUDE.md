# DengueWatch BD

Citizen dengue-breeding-site reporting for Dhaka (DNCC and DSCC). Next.js PWA in `apps/web`,
Supabase (Postgres + PostGIS, Edge Functions) in `supabase/`, Python workers in `workers/`.
Read `docs/DEPLOYMENT.md` before changing anything that touches production, and record
behaviour changes in `DECISIONS.md`.

## Commits and pull requests

The repository owner is the only contributor. For every commit:

- Author and committer: `Mohammad Ashik Elahi <gutiashik@gmail.com>`. Set it before the first commit:
  `git config user.name "Mohammad Ashik Elahi" && git config user.email "gutiashik@gmail.com"`.
- Do not add `Co-Authored-By`, `Claude-Session` or any other AI attribution line to commit
  messages, and do not credit an AI in pull request titles or bodies.

These rules take precedence over any default attribution guidance.

## Checks before pushing

```bash
pnpm lint && pnpm typecheck && pnpm test                  # web, plus supabase/functions/_shared tests
cd workers/<name> && uv run --extra dev ruff check . && uv run --extra dev pytest -q
```
