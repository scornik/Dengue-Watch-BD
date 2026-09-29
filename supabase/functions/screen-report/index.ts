// screen-report: optional paid screening tier (OFF by default).
//
// Body: {"report_id": "<uuid>"} (called by submit-report) or {"backlog": true}
// (hourly pg_cron). Runs only when PAID_AI_ENABLED=true, only for reports whose
// ai_label is unclear/pending and not yet decided by a human, and never more
// than AI_DAILY_CAP calls per Asia/Dhaka day (atomic counter in Postgres).
// Invalid provider output keeps ai_label = unclear.
import { createClient } from "@supabase/supabase-js";
import { json } from "../_shared/cors.ts";
import { providerFromEnv } from "../_shared/vision.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENABLED = Deno.env.get("PAID_AI_ENABLED") === "true";
const CAP = Number(Deno.env.get("AI_DAILY_CAP") ?? 100);
const BACKLOG_BATCH = 20;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type Row = { id: string; photo_path: string; ai_label: string; ai_source: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  // Service role only (pg_cron / submit-report). verify_jwt already checked the signature.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token !== SERVICE_KEY) return json({ error: "forbidden" }, 403);
  if (!ENABLED) return json({ skipped: "PAID_AI_ENABLED is not true" }, 200);

  const provider = providerFromEnv((k) => Deno.env.get(k));
  if (!provider) return json({ skipped: "no provider configured" }, 200);

  const body = await req.json().catch(() => ({}));
  let q = admin
    .from("reports")
    .select("id, photo_path, ai_label, ai_source")
    .in("ai_label", ["unclear", "pending"])
    .neq("ai_source", "human");
  q = body.report_id ? q.eq("id", body.report_id) : q.order("created_at", { ascending: true }).limit(BACKLOG_BATCH);
  const { data: rows, error } = await q;
  if (error) return json({ error: "query failed" }, 500);

  // Skip reports a paid/model provider already looked at.
  const ids = (rows ?? []).map((r: Row) => r.id);
  const { data: seen } = ids.length
    ? await admin.from("ai_labels").select("report_id").in("report_id", ids).in("source", ["api", "model"])
    : { data: [] };
  const done = new Set((seen ?? []).map((s: { report_id: string }) => s.report_id));

  const results: Array<{ id: string; label: string | null }> = [];
  for (const r of (rows ?? []) as Row[]) {
    if (done.has(r.id)) continue;
    const { data: ok } = await admin.rpc("claim_ai_quota", { p_provider: provider.name, p_cap: CAP });
    if (!ok) {
      results.push({ id: r.id, label: null });
      break; // daily cap reached
    }
    const file = await admin.storage.from("report-photos").download(r.photo_path);
    if (file.error || !file.data) continue;
    let outcome: Awaited<ReturnType<typeof provider.screen>>;
    try {
      outcome = await provider.screen(toBase64(new Uint8Array(await file.data.arrayBuffer())));
    } catch (e) {
      outcome = { result: null, raw: { error: String(e).slice(0, 300) } };
    }
    const res = outcome.result;
    await admin.from("ai_labels").insert({
      report_id: r.id,
      source: provider.source,
      model: `${provider.name}:${provider.model}`,
      label: res?.label ?? "unclear",
      score: res?.score ?? null,
      raw_json: { result: res, raw: outcome.raw },
    });
    // Never overwrite a human decision that happened meanwhile.
    await admin
      .from("reports")
      .update(
        res
          ? { ai_label: res.label, ai_score: res.score, ai_source: provider.source }
          : { ai_label: "unclear" },
      )
      .eq("id", r.id)
      .neq("ai_source", "human");
    results.push({ id: r.id, label: res?.label ?? "unclear" });
  }
  return json({ provider: provider.name, screened: results }, 200);
});
