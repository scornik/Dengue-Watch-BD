import { getLocale, getTranslations } from "next-intl/server";
import { getPublicServerClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";

/** City-wide numbers from the public scorecard (last 28 days). */
export async function HomeStats() {
  const t = await getTranslations("home");
  const locale = await getLocale();
  let sites = 0;
  let cleared = 0;
  try {
    const { data } = await getPublicServerClient()
      .from("public_ward_scorecard")
      .select("sites_28d, cleared_28d");
    for (const row of data ?? []) {
      sites += row.sites_28d ?? 0;
      cleared += row.cleared_28d ?? 0;
    }
  } catch {
    return null;
  }
  return (
    <section className="card" aria-labelledby="stats-title">
      <h2 id="stats-title" className="text-sm font-bold uppercase text-muted">
        {t("statsTitle")}
      </h2>
      <dl className="mt-2 grid grid-cols-2 gap-3 text-center">
        <div>
          <dd className="text-3xl font-bold text-brand-700">{formatNumber(sites, locale)}</dd>
          <dt className="text-sm text-muted">{t("statsSites")}</dt>
        </div>
        <div>
          <dd className="text-3xl font-bold text-status-cleared">{formatNumber(cleared, locale)}</dd>
          <dt className="text-sm text-muted">{t("statsCleared")}</dt>
        </div>
      </dl>
    </section>
  );
}
