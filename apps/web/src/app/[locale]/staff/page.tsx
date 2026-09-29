"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { StaffGate } from "@/components/StaffGate";
import { canAdmin, canInspect, canModerate, canResearch } from "@/lib/staff/useStaff";
import { getBrowserClient } from "@/lib/supabase/client";
import { PushOptIn } from "@/components/PushOptIn";

export default function StaffHome() {
  const t = useTranslations();
  return (
    <StaffGate allow={(r) => r !== "citizen"}>
      {({ profile }) => (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{t("staff.title")}</h1>
          <p className="text-muted">
            {t("staff.role", { role: t(`staff.roles.${profile.role}`) })}
            {profile.display_name ? ` · ${profile.display_name}` : ""}
          </p>
          <div className="grid gap-3">
            {canModerate(profile.role) && (
              <Link href="/staff/moderate" className="btn-primary">
                {t("staff.moderation")}
              </Link>
            )}
            {canInspect(profile.role) && (
              <Link href="/staff/inspect" className="btn-primary">
                {t("staff.inspector")}
              </Link>
            )}
            {canAdmin(profile.role) && (
              <Link href="/staff/admin" className="btn-secondary">
                {t("staff.admin")}
              </Link>
            )}
            {canResearch(profile.role) && (
              <Link href="/data" className="btn-secondary">
                {t("nav.data")}
              </Link>
            )}
          </div>
          <PushOptIn />
          <button
            className="btn-ghost"
            onClick={async () => {
              await getBrowserClient().auth.signOut();
              window.location.reload();
            }}
          >
            {t("auth.signOut")}
          </button>
        </div>
      )}
    </StaffGate>
  );
}
