import { createClient, type Session } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

// Local/CI Supabase only. The service key is read from the test environment.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const admin = () => createClient(URL, SERVICE, { auth: { persistSession: false } });

export async function createStaff(
  role: "moderator" | "inspector" | "ward_admin" | "superadmin" | "researcher",
  extra: { ward_id?: number; city_corp?: "DNCC" | "DSCC" } = {},
): Promise<{ id: string; session: Session }> {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.test`;
  const password = `pw-${Math.random().toString(36)}-X1!`;
  const sb = admin();
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const { error: pErr } = await sb.from("profiles").update({ role, ...extra }).eq("id", data.user.id);
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr || !s.session) throw sErr ?? new Error("sign-in failed");
  return { id: data.user.id, session: s.session };
}

/** Make the app start with this session (supabase-js localStorage key). */
export async function useSession(page: Page, session: Session) {
  const ref = new globalThis.URL(URL).hostname.split(".")[0];
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [`sb-${ref}-auth-token`, JSON.stringify(session)],
  );
}
