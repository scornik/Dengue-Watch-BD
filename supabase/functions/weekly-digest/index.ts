// weekly-digest: per-ward summary emailed to ward admins every Monday.
// Called by pg_cron (service role). Email via Resend's HTTP API when
// RESEND_API_KEY is set (free tier); otherwise the digest is only logged and
// admins use the printable page (/staff/digest). Idempotent per week+recipient.
import { createClient } from "@supabase/supabase-js";
import { json } from "../_shared/cors.ts";
import { digestSubject, previousWeek, renderDigestHtml, type DigestRow } from "../_shared/digest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("DIGEST_FROM") ?? "DengueWatch BD <digest@example.org>";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token !== SERVICE_KEY) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const week = body.week_start ? { date: body.week_start, start: `${body.week_start}T00:00:00+06:00` } : previousWeek();
  const { data: recipients, error } = await admin.rpc("digest_recipients");
  if (error) return json({ error: "recipients query failed" }, 500);

  const cache = new Map<string, string>();
  const results: Array<{ email: string; status: string }> = [];
  for (const r of recipients ?? []) {
    const { data: already } = await admin.from("digest_log").select("week").eq("week", week.date).eq("recipient", r.email).maybeSingle();
    if (already && !body.force) {
      results.push({ email: r.email, status: "already sent" });
      continue;
    }
    let html = cache.get(r.city_corp);
    if (!html) {
      const { data: rows } = await admin.rpc("ward_digest", { p_city_corp: r.city_corp, p_week_start: week.start });
      html = renderDigestHtml({ cityCorp: r.city_corp, weekStart: week.date, rows: (rows ?? []) as DigestRow[], siteUrl: SITE_URL });
      cache.set(r.city_corp, html);
    }
    let status = "logged (no RESEND_API_KEY)";
    if (RESEND) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [r.email], subject: digestSubject(r.city_corp, week.date), html }),
      });
      status = res.ok ? "sent" : `failed ${res.status}`;
    }
    if (!status.startsWith("failed")) {
      await admin.from("digest_log").upsert({ week: week.date, recipient: r.email, ward_scope: r.city_corp });
    }
    results.push({ email: r.email, status });
  }
  return json({ week: week.date, results }, 200);
});
