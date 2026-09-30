import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { select, type PublicWard, type Scorecard } from "@/lib/publicApi";
import { formatDate, formatNumber } from "@/lib/format";
import { RiskBadge } from "@/components/ward/RiskBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { SITE_ICONS } from "@/components/report/siteIcons";
import type { SiteStatus, SiteType } from "@/lib/report/types";

export const revalidate = 300;

type RecentSite = { id: string; status: SiteStatus; site_type: SiteType; report_count: number; first_reported_at: string };

async function loadWard(id: number) {
  const opts = { next: { revalidate: 300 } };
  const [ward] = await select<PublicWard[]>("public_wards", `select=*&id=eq.${id}`, opts);
  if (!ward) return null;
  const [card] = await select<Scorecard[]>("public_ward_scorecard", `select=*&ward_id=eq.${id}`, opts);
  const recent = await select<RecentSite[]>(
    "public_sites",
    `select=id,status,site_type,report_count,first_reported_at&ward_id=eq.${id}&order=first_reported_at.desc&limit=10`,
    opts,
  );
  return { ward, card, recent };
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/ward/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const n = parseId(id);
  const data = n ? await loadWard(n).catch(() => null) : null;
  if (!data) return {};
  return { title: locale === "bn" ? data.ward.name_bn : data.ward.name_en };
}

export default async function WardPage({ params }: PageProps<"/[locale]/ward/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const n = parseId(id);
  if (!n) notFound();
  // A database error throws (error page, stale ISR copy kept); only a missing ward is a 404.
  const data = await loadWard(n);
  if (!data) notFound();
  const { ward, card, recent } = data;
  const t = await getTranslations("ward");
  const tr = await getTranslations("risk");
  const tt = await getTranslations("siteType");
  const fmt = (v: number | null | undefined, digits = 0) => (v == null ? "–" : formatNumber(v, locale, digits));

  const stats: Array<[string, string]> = [
    [t("sites"), fmt(card?.sites_28d)],
    [t("cleared"), fmt(card?.cleared_28d)],
    [t("open"), fmt(card?.open_28d)],
    [t("overdue"), fmt(card?.overdue_28d)],
    [t("medianHours"), card?.median_hours_to_clear == null ? "–" : t("hours", { hours: fmt(card.median_hours_to_clear, 1) })],
    [t("pct72"), card?.pct_cleared_72h == null ? "–" : `${fmt(card.pct_cleared_72h, 1)}%`],
  ];

  const inputs: Array<[string, string]> = [
    [t("ndvi"), fmt(ward.ndvi, 2)],
    [t("ndwi"), fmt(ward.ndwi, 2)],
    [t("ndbi"), fmt(ward.ndbi, 2)],
    [t("lst"), ward.lst_c == null ? "–" : `${fmt(ward.lst_c, 1)} °C`],
    [t("rain"), ward.rain_14d_mm == null ? "–" : `${fmt(ward.rain_14d_mm)} mm`],
    [t("density"), fmt(ward.report_density, 1)],
    [t("casesArea"), fmt(ward.cases_area)],
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">{ward.city_corp}</p>
        <h1 className="text-2xl font-bold">{locale === "bn" ? ward.name_bn : ward.name_en}</h1>
      </div>

      <section className="card" aria-labelledby="sc-h">
        <h2 id="sc-h" className="font-bold">
          {t("scorecard")}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="scorecard">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-sky p-3">
              <dd className="text-2xl font-bold text-brand-700">{value}</dd>
              <dt className="text-xs text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="card space-y-2" aria-labelledby="risk-h">
        <div className="flex items-center justify-between">
          <h2 id="risk-h" className="font-bold">
            {t("risk")}
          </h2>
          <RiskBadge level={ward.risk_level} />
        </div>
        <p className="text-xs font-bold text-ink">⚠️ {tr("layer")}</p>
        {ward.risk_week && <p className="text-xs text-muted">{t("riskWeek", { date: formatDate(ward.risk_week, locale) })}</p>}
        <details>
          <summary className="cursor-pointer text-sm font-bold">{t("drivers")}</summary>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {inputs.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
        <p className="text-sm text-muted">{tr("explain")}</p>
        <Link href="/about/risk" className="text-sm font-bold text-brand-700 underline">
          {tr("method")}
        </Link>
      </section>

      <section className="card" aria-labelledby="recent-h">
        <h2 id="recent-h" className="font-bold">
          {t("recent")}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">{t("noData")}</p>
        ) : (
          <ul className="mt-2 divide-y">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {SITE_ICONS[s.site_type]} {tt(s.site_type)} · {formatDate(s.first_reported_at, locale)}
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/map" className="btn-secondary">
          🗺️
        </Link>
        <Link href="/ward" className="btn-ghost">
          {t("allWards")}
        </Link>
      </div>
    </div>
  );
}
