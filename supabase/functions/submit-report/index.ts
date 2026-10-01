// submit-report: the only way citizens create reports.
//
// multipart/form-data: meta (JSON, see _shared/report.ts) + photo (JPEG)
// 0. require a signed-in user (anonymous Supabase sign-in counts): 401 otherwise
// 1. validate meta (zod) and photo (JPEG, <= 8 MB)
// 2. rules tier: rate limits (10/h, 30/day per device) and phone OTP after N reports
// 3. strip EXIF, upload to private bucket report-photos
// 4. insert report (trigger sets ward, merges into a site, re-checks limits)
// 5. log the on-device screening result; optionally queue paid screening
//
// Deploy with --no-verify-jwt (CORS preflight carries no JWT); the function
// checks the user JWT itself. Requests with only the anon key (or an expired
// session) get 401, which the offline queue treats as retryable and re-acquires
// a session on its next flush. reporter_id is therefore always set, so rate
// limits cannot be dodged by rotating the client-chosen device_id.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, json } from "../_shared/cors.ts";
import { isJpeg, JpegError, stripJpegMetadata } from "../_shared/jpeg.ts";
import { MAX_PHOTO_BYTES, photoPath, reportMetaSchema, sanitizeNote, sha256Hex } from "../_shared/report.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SALT = Deno.env.get("DEVICE_HASH_SALT") ?? "";
const OTP_AFTER = Number(Deno.env.get("OTP_REQUIRED_AFTER") ?? 5);
const OTP_ENABLED = Deno.env.get("PHONE_OTP_ENABLED") === "true";
const PAID_AI = Deno.env.get("PAID_AI_ENABLED") === "true";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function reporterFromAuth(req: Request): Promise<{ id: string; phoneVerified: boolean } | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, phoneVerified: !!data.user.phone_confirmed_at };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, cors);
  if (!SALT) return json({ error: "server misconfigured: DEVICE_HASH_SALT" }, 500, cors);

  const reporter = await reporterFromAuth(req);
  if (!reporter) return json({ error: "sign in required", code: "auth_required" }, 401, cors);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart/form-data" }, 400, cors);
  }

  // 1. Validate
  let meta;
  try {
    meta = reportMetaSchema.parse(JSON.parse(String(form.get("meta") ?? "")));
  } catch (e) {
    return json({ error: "invalid meta", detail: e instanceof Error ? e.message.slice(0, 500) : null }, 400, cors);
  }
  const photo = form.get("photo");
  if (!(photo instanceof File)) return json({ error: "photo missing" }, 400, cors);
  if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo too large" }, 413, cors);
  let bytes: Uint8Array = new Uint8Array(await photo.arrayBuffer());
  if (!isJpeg(bytes)) return json({ error: "photo must be JPEG" }, 415, cors);

  // Idempotency: the offline queue may resend a report that already arrived.
  const existing = await admin.from("reports").select("id, site_id, ward_id").eq("id", meta.id).maybeSingle();
  if (existing.data) return json({ ...existing.data, duplicate: true }, 200, cors);

  // 2. Rules tier
  const deviceHash = await sha256Hex(`${meta.device_id}:${SALT}`);
  const { data: quota, error: qErr } = await admin.rpc("report_quota", { p_device_hash: deviceHash }).single<{
    last_hour: number;
    last_day: number;
    total: number;
    hour_limit: number;
    day_limit: number;
  }>();
  if (qErr || !quota) return json({ error: "quota check failed" }, 500, cors);
  if (quota.last_hour >= quota.hour_limit || quota.last_day >= quota.day_limit) {
    return json({ error: "rate_limited", code: "rate_limited" }, 429, { ...cors, "Retry-After": "3600" });
  }
  let aiLabel = meta.ai_label;
  if (quota.total >= OTP_AFTER && !reporter.phoneVerified) {
    if (OTP_ENABLED) return json({ error: "phone verification required", code: "otp_required" }, 403, cors);
    // Free fallback without SMS: repeat reporters' reports go to human review first.
    if (aiLabel === "likely") aiLabel = "unclear";
  }

  // 3. Strip metadata and store
  try {
    bytes = stripJpegMetadata(bytes);
  } catch (e) {
    return json({ error: e instanceof JpegError ? e.message : "bad JPEG" }, 415, cors);
  }
  const path = photoPath(meta.id);
  const up = await admin.storage.from("report-photos").upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) return json({ error: "upload failed" }, 502, cors);

  // 4. Insert
  const { data: row, error: insErr } = await admin
    .from("reports")
    .insert({
      id: meta.id,
      reporter_id: reporter.id,
      photo_path: path,
      geom: `SRID=4326;POINT(${meta.lng} ${meta.lat})`,
      accuracy_m: meta.accuracy_m,
      site_type: meta.site_type,
      larvae_seen: meta.larvae_seen,
      self_cleaned: meta.self_cleaned,
      note: sanitizeNote(meta.note),
      ai_label: aiLabel,
      ai_score: meta.ai_score,
      ai_source: "device",
      device_hash: deviceHash,
    })
    .select("id, site_id, ward_id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      const again = await admin.from("reports").select("id, site_id, ward_id").eq("id", meta.id).maybeSingle();
      return json({ ...again.data, duplicate: true }, 200, cors);
    }
    if (insErr.code === "P0429") return json({ error: "rate_limited", code: "rate_limited" }, 429, cors);
    await admin.storage.from("report-photos").remove([path]);
    return json({ error: "insert failed" }, 500, cors);
  }

  // 5. Screening log + optional paid tier (never blocks the response)
  const background = (async () => {
    if (meta.ai_label !== "pending") {
      await admin.from("ai_labels").insert({
        report_id: row.id,
        source: "device",
        model: Deno.env.get("CLIP_MODEL_ID") ?? "clip-zero-shot",
        label: meta.ai_label,
        score: meta.ai_score,
        raw_json: { device_label: meta.ai_label, score: meta.ai_score },
      });
    }
    if (PAID_AI && (aiLabel === "unclear" || aiLabel === "pending")) {
      await fetch(`${SUPABASE_URL}/functions/v1/screen-report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: row.id }),
      }).catch(() => {});
    }
  })();
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(background);
  else await background;

  return json(row, 201, cors);
});
