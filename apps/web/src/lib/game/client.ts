"use client";

import { ensureCitizenSession, getBrowserClient } from "@/lib/supabase/client";
import { prepareAvatar } from "@/lib/image/compress";

export type MyStats = {
  handle: string | null;
  avatar_path: string | null;
  points: number;
  points_week: number;
  cleans: number;
  reports: number;
  rank: number | null;
  active_claims: number;
};

export type Claim = { id: string; site_id: string; status: string; expires_at: string; points: number };

/** Server error codes raised by the game RPCs -> hunt.* message keys. */
const ERRORS: Record<string, string> = {
  handle_required: "errHandle",
  already_claimed: "errClaimed",
  too_many_claims: "errTooMany",
  daily_limit: "errDaily",
  claim_expired: "errExpired",
  site_not_open: "errNotOpen",
  photo_missing: "errPhoto",
  too_far: "tooFarShort",
};
export function errorKey(message: string | undefined): string {
  const code = Object.keys(ERRORS).find((k) => message?.includes(k));
  return code ? ERRORS[code]! : "errGeneric";
}

/** Signal the header XP chip to refresh. */
export const bumpXp = () => window.dispatchEvent(new Event("dw:xp"));

export async function myStats(): Promise<MyStats | null> {
  const sb = getBrowserClient();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return null;
  const { data } = await sb.rpc("my_stats");
  return (Array.isArray(data) ? data[0] : null) ?? null;
}

export async function setHandle(handle: string): Promise<"ok" | "taken" | "error"> {
  await ensureCitizenSession();
  const sb = getBrowserClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return "error";
  const { error } = await sb.from("profiles").update({ handle: handle.trim() }).eq("id", u.user.id);
  if (!error) return "ok";
  return error.code === "23505" ? "taken" : "error";
}

export async function uploadAvatar(file: File): Promise<string | null> {
  await ensureCitizenSession();
  const sb = getBrowserClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const blob = await prepareAvatar(file);
  // New name each time so caches/CDN never show the old face.
  const path = `${u.user.id}/${Date.now()}.jpg`;
  const up = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (up.error) return null;
  const { error } = await sb.from("profiles").update({ avatar_path: path }).eq("id", u.user.id);
  return error ? null : path;
}

export async function myClaim(siteId: string): Promise<Claim | null> {
  const sb = getBrowserClient();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return null;
  const { data } = await sb
    .from("cleanups")
    .select("id, site_id, status, expires_at, points")
    .eq("site_id", siteId)
    .eq("volunteer_id", s.session.user.id)
    .in("status", ["claimed", "done"])
    .order("claimed_at", { ascending: false })
    .limit(1);
  return (data?.[0] as Claim | undefined) ?? null;
}

export async function claimSite(siteId: string): Promise<{ claim?: Claim; error?: string }> {
  await ensureCitizenSession();
  const { data, error } = await getBrowserClient().rpc("claim_site", { p_site: siteId });
  return error ? { error: errorKey(error.message) } : { claim: data as Claim };
}

export async function releaseClaim(id: string) {
  await getBrowserClient().rpc("release_claim", { p_cleanup: id });
}

export async function finishCleanup(
  claim: Claim,
  photo: Blob,
  at: { lat: number; lng: number },
  note?: string,
): Promise<{ claim?: Claim; error?: string }> {
  const sb = getBrowserClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { error: "errGeneric" };
  const path = `${u.user.id}/${claim.id}.jpg`;
  const up = await sb.storage.from("cleanup-photos").upload(path, photo, { contentType: "image/jpeg", upsert: true });
  if (up.error) return { error: "errPhoto" };
  const { data, error } = await sb.rpc("complete_cleanup", {
    p_cleanup: claim.id,
    p_photo_path: path,
    p_lat: at.lat,
    p_lng: at.lng,
    p_note: note ?? null,
  });
  if (error) return { error: errorKey(error.message) };
  bumpXp();
  return { claim: data as Claim };
}
