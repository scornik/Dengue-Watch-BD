"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useStaff, canResearch } from "@/lib/staff/useStaff";

export function ResearchDownload() {
  const t = useTranslations("data");
  const staff = useStaff();
  const [msg, setMsg] = useState<string | null>(null);
  if (staff.status !== "ready" || !canResearch(staff.profile.role)) {
    return (
      <p className="text-sm">
        {t("research")}{" "}
        <Link href="/staff/login" className="font-bold text-brand-700 underline">
          →
        </Link>
      </p>
    );
  }
  return (
    <>
      <button
        className="btn-secondary w-full"
        onClick={async () => {
          const res = await fetch("/api/export/research.csv", {
            headers: { Authorization: `Bearer ${staff.session.access_token}` },
          });
          if (!res.ok) return setMsg(String(res.status));
          const a = document.createElement("a");
          a.href = URL.createObjectURL(await res.blob());
          a.download = "denguewatch-research-reports.csv";
          a.click();
        }}
      >
        ⬇ {t("researchCsv")}
      </button>
      {msg && <p role="alert">{msg}</p>}
    </>
  );
}
