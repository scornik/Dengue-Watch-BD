// notify-support: emails the support team about new contact-form messages.
// Called by a trigger on every new message and by pg_cron every 10 minutes (service role).
// Messages are claimed before sending (claim_support_notifications) and stamped once sent,
// so each is emailed once. Without RESEND_API_KEY or SUPPORT_NOTIFY_TO nothing is claimed:
// messages simply wait in /staff/inbox, and are emailed once both are set (within 7 days).
import { createClient } from "@supabase/supabase-js";
import { bearer, isServiceToken } from "../_shared/auth.ts";
import { json } from "../_shared/cors.ts";
import { renderSupportHtml, renderSupportText, replyTo, supportSubject, type SupportMessage } from "../_shared/support.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const RESEND = Deno.env.get("RESEND_API_KEY");
const RESEND_URL = Deno.env.get("RESEND_API_URL") ?? "https://api.resend.com/emails";
const FROM = Deno.env.get("SUPPORT_FROM") ?? Deno.env.get("DIGEST_FROM") ?? "DengueWatch BD <support@example.org>";
const TO = (Deno.env.get("SUPPORT_NOTIFY_TO") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  // Only pg_net with the Vault key may call this (verify_jwt = true; see _shared/auth.ts).
  if (!isServiceToken(bearer(req), SERVICE_KEY)) return json({ error: "forbidden" }, 403);
  if (!RESEND || !TO.length) return json({ skipped: "set RESEND_API_KEY and SUPPORT_NOTIFY_TO to email new messages" }, 200);

  const { data, error } = await admin.rpc("claim_support_notifications", { p_limit: 20 });
  if (error) return json({ error: "claim failed" }, 500);

  const results: Array<{ id: string; status: string }> = [];
  for (const m of (data ?? []) as SupportMessage[]) {
    const reply = replyTo(m.contact);
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        subject: supportSubject(m),
        html: renderSupportHtml(m, SITE_URL),
        text: renderSupportText(m, SITE_URL),
        ...(reply ? { reply_to: reply } : {}),
      }),
    }).catch(() => null);
    if (res?.ok) {
      await admin.from("support_messages").update({ notified_at: new Date().toISOString() }).eq("id", m.id);
      results.push({ id: m.id, status: "sent" });
    } else {
      // Left claimed: the 10-minute sweep retries it after the claim expires.
      results.push({ id: m.id, status: `failed ${res?.status ?? "network"}` });
    }
  }
  return json({ results }, 200);
});
