"use client";

import { useTranslations } from "next-intl";
import { StaffGate } from "@/components/StaffGate";
import { SupportInbox } from "@/components/staff/SupportInbox";
import { canSupport } from "@/lib/staff/useStaff";

export default function InboxPage() {
  const t = useTranslations("inbox");
  return (
    <StaffGate allow={canSupport}>
      {() => (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <SupportInbox />
        </div>
      )}
    </StaffGate>
  );
}
