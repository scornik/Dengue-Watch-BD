import { getLocale, getTranslations } from "next-intl/server";
import { select, type CaseCount } from "@/lib/publicApi";
import { formatDate, formatNumber } from "@/lib/format";

/** Latest official admissions/deaths for DNCC, DSCC and the national total. */
export async function CasesPanel() {
  const t = await getTranslations("map");
  const locale = await getLocale();
  let rows: CaseCount[] = [];
  try {
    rows = await select<CaseCount[]>(
      "public_case_counts",
      "select=*&area=in.(DNCC,DSCC,BANGLADESH)&order=date.desc&limit=9",
      { next: { revalidate: 900 } },
    );
  } catch {
    return null;
  }
  if (!rows.length) return null;
  const latest = rows[0]!.date;
  const today = rows.filter((r) => r.date === latest);
  return (
    <section className="card" aria-labelledby="cases-h">
      <h2 id="cases-h" className="font-bold">
        {t("cases")}
      </h2>
      <p className="text-xs text-muted">{t("casesLatest", { date: formatDate(latest, locale) })}</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="font-normal"></th>
            <th scope="col" className="font-normal">
              {t("admissions")}
            </th>
            <th scope="col" className="font-normal">
              {t("deaths")}
            </th>
          </tr>
        </thead>
        <tbody>
          {today.map((r) => (
            <tr key={r.area}>
              <th scope="row" className="py-1 text-left">
                {r.area === "BANGLADESH" ? "🇧🇩" : r.area}
              </th>
              <td>{formatNumber(r.admissions, locale)}</td>
              <td>{formatNumber(r.deaths, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {today[0]?.source_url && (
        <a href={today[0].source_url} className="text-xs underline" rel="noopener noreferrer" target="_blank">
          DGHS ↗
        </a>
      )}
    </section>
  );
}
