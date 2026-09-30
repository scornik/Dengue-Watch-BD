"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatNumber, hoursSince } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/ward/RiskBadge";
import { SITE_ICONS } from "@/components/report/siteIcons";
import type { SiteStatus, SiteType } from "@/lib/report/types";
import type { RiskLevel } from "@/lib/map/colors";

export type QueueSite = {
  id: string;
  status: SiteStatus;
  site_type: SiteType;
  larvae_reported: boolean;
  report_count: number;
  first_reported_at: string;
  assigned_to: string | null;
  ward_id: number | null;
  lat: number;
  lng: number;
  ward_name_bn: string | null;
  ward_name_en: string | null;
  risk_level: RiskLevel | null;
  risk_rank: number;
  photo_path: string | null;
  note: string | null;
};

export function InspectorQueue({ userId }: { userId: string }) {
  const t = useTranslations("insp");
  const tt = useTranslations("siteType");
  const locale = useLocale();
  const [sites, setSites] = useState<QueueSite[] | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    getBrowserClient()
      .from("inspector_queue")
      .select("*")
      .order("risk_rank")
      .order("first_reported_at")
      .limit(200)
      .then(({ data }) => setSites((data as QueueSite[]) ?? []));
  }, []);

  if (!sites) return <p className="text-muted">…</p>;
  if (!sites.length) return <p className="card text-center">{t("empty")}</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{t("sortedBy")}</p>
      <ul className="space-y-2" data-testid="insp-queue">
        {sites.map((s) => {
          const age = hoursSince(s.first_reported_at, now);
          return (
            <li key={s.id}>
              <Link
                href={`/staff/inspect/${s.id}`}
                prefetch={false}
                className={`card flex items-center gap-3 ${age > 72 ? "border-l-4 border-l-blood" : ""}`}
              >
                <span className="text-3xl" aria-hidden="true">
                  {SITE_ICONS[s.site_type]}
                </span>
                <span className="flex-1">
                  <span className="block font-bold">
                    {tt(s.site_type)} {s.larvae_reported && "🦟"}
                  </span>
                  <span className="block text-xs text-muted">
                    {(locale === "bn" ? s.ward_name_bn : s.ward_name_en) ?? "—"} ·{" "}
                    {t("age", { hours: formatNumber(age, locale) })} · {s.report_count}×
                    {s.assigned_to === userId && " · 👤"}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <StatusBadge status={s.status} />
                  <RiskBadge level={s.risk_level} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
