"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/staff/useStaff";

const ROLES: Role[] = ["moderator", "inspector", "ward_admin", "researcher", "superadmin"];

export function InviteForm({ profile }: { profile: Profile }) {
  const t = useTranslations();
  const [msg, setMsg] = useState<string | null>(null);
  // Ward admins may only invite inspectors for wards in their city corporation (enforced by RLS).
  const roles = profile.role === "superadmin" ? ROLES : (["inspector"] as Role[]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const corp = String(f.get("city_corp") || "") || null;
    const wardNo = Number(f.get("ward_no") || 0);
    const role = String(f.get("role")) as Role;
    const wardId = wardNo ? (corp === "DSCC" ? 100 + wardNo : wardNo) : null;
    const { error } = await getBrowserClient()
      .from("staff_invites")
      .upsert({
        email: String(f.get("email")).trim().toLowerCase(),
        role,
        ward_id: role === "inspector" ? wardId : null,
        city_corp: role === "ward_admin" ? corp : null,
        display_name: String(f.get("display_name") || "") || null,
        invited_by: profile.id,
      });
    setMsg(error ? error.message : t("admin.inviteSent"));
    if (!error) e.currentTarget.reset();
  };

  return (
    <section className="card" aria-labelledby="inv-h">
      <h2 id="inv-h" className="text-lg font-bold">
        {t("admin.invites")}
      </h2>
      <form onSubmit={onSubmit} className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2">
          <span className="field-label">{t("auth.email")}</span>
          <input name="email" type="email" required className="input" />
        </label>
        <label className="col-span-2">
          <span className="field-label">{t("admin.name")}</span>
          <input name="display_name" className="input" />
        </label>
        <label>
          <span className="field-label">{t("staff.title")}</span>
          <select name="role" className="input">
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`staff.roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">{t("admin.cityCorp")}</span>
          <select name="city_corp" className="input" defaultValue={profile.city_corp ?? "DNCC"}>
            <option value="DNCC">DNCC</option>
            <option value="DSCC">DSCC</option>
          </select>
        </label>
        <label className="col-span-2">
          <span className="field-label">{t("admin.ward")}</span>
          <input name="ward_no" type="number" min={1} max={75} className="input" inputMode="numeric" />
        </label>
        <button className="btn-primary col-span-2">{t("admin.invite")}</button>
      </form>
      {msg && (
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
      )}
    </section>
  );
}
