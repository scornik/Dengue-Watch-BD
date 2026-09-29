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
