import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { select, type PublicWard, type Scorecard } from "@/lib/publicApi";
import { formatNumber } from "@/lib/format";
import { RiskBadge } from "@/components/ward/RiskBadge";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]/ward">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ward" });
  return { title: t("allWards") };
}

const RISK_ORDER = { red: 0, orange: 1, yellow: 2, green: 3 } as const;

export default async function WardsPage({ params }: PageProps<"/[locale]/ward">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ward");
  const tr = await getTranslations("risk");
  let wards: PublicWard[] = [];
  let cards: Scorecard[] = [];
  try {
    [wards, cards] = await Promise.all([
      select<PublicWard[]>("public_wards", "select=*&order=city_corp,ward_no", { next: { revalidate: 300 } }),
      select<Scorecard[]>("public_ward_scorecard", "select=*", { next: { revalidate: 300 } }),
    ]);
  } catch {
    /* render empty */
  }
  const byId = new Map(cards.map((c) => [c.ward_id, c]));
  const sorted = [...wards].sort(
    (a, b) =>
      (a.risk_level ? RISK_ORDER[a.risk_level] : 9) - (b.risk_level ? RISK_ORDER[b.risk_level] : 9) ||
      a.city_corp.localeCompare(b.city_corp) ||
      a.ward_no - b.ward_no,
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("allWards")}</h1>
      <p className="text-sm text-muted">{tr("layer")}</p>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-sky-200">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("scorecard")}</caption>
          <thead className="bg-sky text-left">
            <tr>
              <th scope="col" className="p-2">
                {t("allWards")}
              </th>
              <th scope="col" className="p-2">
                {t("risk")}
              </th>
              <th scope="col" className="p-2 text-right">
                {t("open")}
              </th>
              <th scope="col" className="p-2 text-right">
                {t("pct72")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((w) => {
              const c = byId.get(w.id);
              return (
                <tr key={w.id}>
                  <th scope="row" className="p-2 text-left font-normal">
                    <Link href={`/ward/${w.id}`} prefetch={false} className="font-bold text-brand-700 underline">
                      {locale === "bn" ? w.name_bn : w.name_en}
                    </Link>
                  </th>
                  <td className="p-2">
                    <RiskBadge level={w.risk_level} />
                  </td>
                  <td className="p-2 text-right">{formatNumber(c?.open_28d ?? 0, locale)}</td>
                  <td className="p-2 text-right">
                    {c?.pct_cleared_72h == null ? "–" : `${formatNumber(c.pct_cleared_72h, locale)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
