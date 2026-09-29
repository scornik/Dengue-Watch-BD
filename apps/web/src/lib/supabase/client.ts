"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/** Singleton browser client (session persisted in localStorage). */
export function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return browserClient;
}

/** Returns an access token, creating an anonymous citizen session if needed. */
export async function ensureCitizenSession(): Promise<string | null> {
  const sb = getBrowserClient();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error) return null;
  return anon.session?.access_token ?? null;
}
