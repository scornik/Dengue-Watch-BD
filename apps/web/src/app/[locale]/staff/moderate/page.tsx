"use client";

import { useTranslations } from "next-intl";
import { StaffGate } from "@/components/StaffGate";
import { ModerationQueue } from "@/components/staff/ModerationQueue";
import { canModerate } from "@/lib/staff/useStaff";

export default function ModeratePage() {
  const t = useTranslations("mod");
  return (
    <StaffGate allow={canModerate}>
      {() => (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <ModerationQueue />
        </div>
      )}
    </StaffGate>
  );
}
