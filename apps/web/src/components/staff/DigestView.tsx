"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/format";
import { RiskBadge } from "@/components/ward/RiskBadge";
import type { Profile } from "@/lib/staff/useStaff";
import type { RiskLevel } from "@/lib/map/colors";

type Row = {
  ward_id: number;
  ward_no: number;
  name_bn: string;
  name_en: string;
  new_sites: number;
  cleared: number;
  not_found: number;
  open_total: number;
  overdue: number;
  risk_level: RiskLevel | null;
};

function lastMonday(): string {
  const d = new Date(Date.now() + 6 * 3600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  return d.toISOString().slice(0, 10);
}

/** Printable weekly digest ("Save as PDF" from the browser print dialog). */
export function DigestView({ profile }: { profile: Profile }) {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const [corp, setCorp] = useState<"DNCC" | "DSCC">(
    (params.get("corp") as "DNCC" | "DSCC") ?? profile.city_corp ?? "DNCC",
  );
  const [week, setWeek] = useState(params.get("week") ?? lastMonday());
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .rpc("ward_digest", { p_city_corp: corp, p_week_start: `${week}T00:00:00+06:00` })
      .then(({ data }) => alive && setRows((data as Row[]) ?? []));
    return () => {
      alive = false;
    };
  }, [corp, week]);

  const n = (v: number) => formatNumber(v, locale);
  const sorted = [...(rows ?? [])].sort((a, b) => b.overdue - a.overdue || b.open_total - a.open_total || a.ward_no - b.ward_no);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        {profile.role === "superadmin" && (
          <label>
            <span className="field-label">{t("admin.cityCorp")}</span>
            <select className="input" value={corp} onChange={(e) => setCorp(e.target.value as "DNCC" | "DSCC")}>
              <option>DNCC</option>
              <option>DSCC</option>
            </select>
          </label>
        )}
        <label>
          <span className="field-label">{t("admin.date")}</span>
          <input type="date" className="input" value={week} onChange={(e) => setWeek(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 PDF
        </button>
      </div>
      <h1 className="text-xl font-bold">
        {t("admin.digest")} · {corp} · {week}
      </h1>
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-1">{t("admin.ward")}</th>
            <th className="p-1 text-right">{t("status.new")}</th>
            <th className="p-1 text-right">{t("status.cleared")}</th>
            <th className="p-1 text-right">{t("ward.open")}</th>
            <th className="p-1 text-right">{t("ward.overdue")}</th>
            <th className="p-1">{t("ward.risk")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((r) => (
            <tr key={r.ward_id}>
              <td className="p-1">{locale === "bn" ? r.name_bn : r.name_en}</td>
              <td className="p-1 text-right">{n(r.new_sites)}</td>
              <td className="p-1 text-right">{n(r.cleared)}</td>
              <td className="p-1 text-right">{n(r.open_total)}</td>
              <td className={`p-1 text-right ${r.overdue ? "font-bold text-red-700" : ""}`}>{n(r.overdue)}</td>
              <td className="p-1">
                <RiskBadge level={r.risk_level} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs">{t("risk.layer")}</p>
    </div>
  );
}
