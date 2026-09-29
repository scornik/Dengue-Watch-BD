"use client";

import { useTranslations } from "next-intl";
import { StaffGate } from "@/components/StaffGate";
import { InspectorQueue } from "@/components/staff/InspectorQueue";
import { canInspect } from "@/lib/staff/useStaff";

export default function InspectPage() {
  const t = useTranslations("insp");
  return (
    <StaffGate allow={canInspect}>
      {({ profile }) => (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <InspectorQueue userId={profile.id} />
        </div>
      )}
    </StaffGate>
  );
}
