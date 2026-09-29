"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useStaff, type Profile, type Role } from "@/lib/staff/useStaff";
import type { Session } from "@supabase/supabase-js";

/** Renders children only for signed-in staff whose role passes `allow`. */
export function StaffGate({
  allow,
  children,
}: {
  allow: (role: Role) => boolean;
  children: (ctx: { session: Session; profile: Profile }) => ReactNode;
}) {
  const state = useStaff();
  const t = useTranslations();
  if (state.status === "loading") return <p className="text-muted">{t("common.loading")}</p>;
  if (state.status === "signed_out") {
    return (
      <div className="card">
        <p>{t("auth.title")}</p>
        <Link href="/staff/login" className="btn-primary mt-3">
          {t("auth.send")}
        </Link>
      </div>
    );
  }
  if (!allow(state.profile.role)) {
    return <p className="card">{t("auth.notStaff")}</p>;
  }
  return <>{children({ session: state.session, profile: state.profile })}</>;
}
