// notify-status: web push to reporters when their site changes status.
// Called every 5 minutes by pg_cron (service role). Processes site_events that
// have not been notified yet, then stamps notified_at (the only mutable column
// of the append-only audit table).
import { createClient } from "@supabase/supabase-js";
import * as webpush from "@negrel/webpush";
import { json } from "../_shared/cors.ts";
import { vapidJwks } from "../_shared/vapid.ts";
import { statusMessage, type Locale, type Status } from "../_shared/i18n.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const NOTIFY: Status[] = ["verified", "assigned", "cleared", "not_found"];

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

type Event = { id: number; site_id: string; to_status: Status };
type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; locale: Locale };

let appServer: webpush.ApplicationServer | null = null;
async function server(): Promise<webpush.ApplicationServer | null> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return null;
  appServer ??= await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get("VAPID_SUBJECT") ?? "mailto:team@example.org",
    vapidKeys: await webpush.importVapidKeys(vapidJwks(pub, priv)),
  });
  return appServer;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token !== SERVICE_KEY) return json({ error: "forbidden" }, 403);

  const { data: events, error } = await admin
    .from("site_events")
    .select("id, site_id, to_status")
    .is("notified_at", null)
    .order("created_at")
    .limit(200);
  if (error) return json({ error: "query failed" }, 500);
  if (!events?.length) return json({ events: 0, sent: 0 }, 200);

  const srv = await server();
  let sent = 0;
  let gone = 0;
  for (const ev of events as Event[]) {
    if (srv && NOTIFY.includes(ev.to_status)) {
      const { data: reporters } = await admin.from("reports").select("reporter_id").eq("site_id", ev.site_id).not("reporter_id", "is", null);
      const ids = [...new Set((reporters ?? []).map((r: { reporter_id: string }) => r.reporter_id))];
      const { data: subs } = ids.length
        ? await admin.from("push_subscriptions").select("*").in("user_id", ids)
        : { data: [] };
      for (const s of (subs ?? []) as Sub[]) {
        const msg = statusMessage(s.locale, ev.to_status);
        const path = s.locale === "en" ? "/en/mine" : "/mine";
        try {
          await srv
            .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
            .pushTextMessage(JSON.stringify({ ...msg, url: `${SITE_URL}${path}`, tag: `site-${ev.site_id}`, lang: s.locale }), {});
          sent++;
        } catch (e) {
          if (e instanceof webpush.PushMessageError && e.isGone()) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
            gone++;
          }
        }
      }
    }
    await admin.from("site_events").update({ notified_at: new Date().toISOString() }).eq("id", ev.id);
  }
  return json({ events: events.length, sent, removed: gone, push_configured: !!srv }, 200);
});
