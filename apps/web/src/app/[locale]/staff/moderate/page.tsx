"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { StaffGate } from "@/components/StaffGate";
import { ModerationQueue } from "@/components/staff/ModerationQueue";
import { CleanupReview } from "@/components/staff/CleanupReview";
import { canModerate } from "@/lib/staff/useStaff";

export default function ModeratePage() {
  const t = useTranslations("mod");
  const [tab, setTab] = useState<"reports" | "cleanups">("reports");
  return (
    <StaffGate allow={canModerate}>
      {() => (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-sky-200 p-1">
            {(
              [
                ["reports", t("tabReports")],
                ["cleanups", t("tabCleanups")],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`font-display min-h-11 rounded-full ${tab === k ? "bg-ink text-white" : "text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "reports" ? <ModerationQueue /> : <CleanupReview />}
        </div>
      )}
    </StaffGate>
  );
}
