"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";

export type Role = "citizen" | "moderator" | "inspector" | "ward_admin" | "researcher" | "superadmin";
export type Profile = {
  id: string;
  role: Role;
  ward_id: number | null;
  city_corp: "DNCC" | "DSCC" | null;
  display_name: string | null;
};

export type StaffState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; session: Session; profile: Profile };

/** Current (non-anonymous) session and profile. */
export function useStaff(): StaffState {
  const [state, setState] = useState<StaffState>({ status: "loading" });
  useEffect(() => {
    const sb = getBrowserClient();
    let alive = true;
    const load = async (session: Session | null) => {
      if (!session || session.user.is_anonymous) {
        if (alive) setState({ status: "signed_out" });
        return;
      }
      const { data } = await sb
        .from("profiles")
        .select("id, role, ward_id, city_corp, display_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!alive) return;
      setState(
        data
          ? { status: "ready", session, profile: data as Profile }
          : { status: "ready", session, profile: { id: session.user.id, role: "citizen", ward_id: null, city_corp: null, display_name: null } },
      );
    };
    sb.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => void load(session));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
}

export const canModerate = (r: Role) => r === "moderator" || r === "ward_admin" || r === "superadmin";
export const canInspect = (r: Role) => r === "inspector" || r === "ward_admin" || r === "superadmin";
export const canAdmin = (r: Role) => r === "ward_admin" || r === "superadmin";
export const canResearch = (r: Role) => r === "researcher" || r === "superadmin";
/** The support team reads the contact inbox. Ward admins work for city corporations, so they don't. */
export const canSupport = (r: Role) => r === "moderator" || r === "superadmin";
