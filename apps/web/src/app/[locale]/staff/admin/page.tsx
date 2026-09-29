"use client";

import { useTranslations } from "next-intl";
import { StaffGate } from "@/components/StaffGate";
import { canAdmin } from "@/lib/staff/useStaff";
import { WardUpload } from "@/components/admin/WardUpload";
import { CaseEntry } from "@/components/admin/CaseEntry";
import { InviteForm } from "@/components/admin/InviteForm";

export default function AdminPage() {
  const t = useTranslations("admin");
  return (
    <StaffGate allow={canAdmin}>
      {({ profile }) => (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <WardUpload />
          <CaseEntry userId={profile.id} />
          <InviteForm profile={profile} />
        </div>
      )}
    </StaffGate>
  );
}
