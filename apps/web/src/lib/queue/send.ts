import { functionsUrl, env } from "@/lib/env";
import type { ReportMeta } from "@/lib/report/types";

export type SendOutcome =
  | { kind: "sent"; siteId: string | null }
  | { kind: "retry"; error: string } // network/server trouble: keep in queue
  | { kind: "rate_limited"; error: string } // keep, but stop flushing for now
  | { kind: "otp_required" }
  | { kind: "rejected"; error: string }; // validation: needs user action

/** POST one report to the submit-report Edge Function. Pure except for fetch. */
export async function sendReport(
  meta: ReportMeta,
  photo: Blob,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SendOutcome> {
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  form.set("photo", photo, `${meta.id}.jpg`);
  let res: Response;
  try {
    res = await fetchImpl(functionsUrl("submit-report"), {
      method: "POST",
      body: form,
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${token ?? env.supabaseAnonKey}`,
      },
    });
  } catch (e) {
    return { kind: "retry", error: e instanceof Error ? e.message : "network" };
  }
  let body: { site_id?: string; code?: string; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (res.ok) return { kind: "sent", siteId: body.site_id ?? null };
  // No/expired session: keep queued; the next flush re-acquires one via ensureCitizenSession.
  if (res.status === 401) return { kind: "retry", error: body.error ?? "auth_required" };
  if (res.status === 429) return { kind: "rate_limited", error: body.error ?? "rate_limited" };
  if (res.status === 403 && body.code === "otp_required") return { kind: "otp_required" };
  if (res.status === 400 || res.status === 413 || res.status === 415) {
    return { kind: "rejected", error: body.error ?? `http_${res.status}` };
  }
  return { kind: "retry", error: body.error ?? `http_${res.status}` };
}
