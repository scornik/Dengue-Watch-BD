import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { publicStorageUrl } from "@/lib/env";
import { formatNumber, hoursSince } from "@/lib/format";
import { rewardFor } from "@/lib/game/rules";
import type { PublicSite } from "@/lib/publicApi";
import { SITE_ICONS } from "@/components/report/siteIcons";

export function SitePhoto({ path, type, className = "" }: { path: string | null; type: PublicSite["site_type"]; className?: string }) {
  if (path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={publicStorageUrl("public-thumbs", path)} alt="" loading="lazy" className={`bg-sky-200 object-cover ${className}`} />
    );
  }
  return (
    <span aria-hidden="true" className={`aedes-band-soft flex items-center justify-center bg-sky text-4xl ${className}`}>
      {SITE_ICONS[type]}
    </span>
  );
}

export function SiteCard({ site, distanceKm, now }: { site: PublicSite; distanceKm?: number | null; now: number }) {
  const t = useTranslations("sites");
  const ts = useTranslations("siteType");
  const locale = useLocale();
  const open = site.status === "new" || site.status === "verified" || site.status === "assigned";
  const hours = hoursSince(site.first_reported_at, now);
  const reward = rewardFor({ larvae: site.larvae_reported, firstReportedAt: site.first_reported_at }, now).total;
  return (
    <li>
      <Link
        href={`/sites/${site.id}`}
        prefetch={false}
        className="flex gap-3 rounded-2xl bg-white p-2 ring-1 ring-sky-200 transition active:scale-[0.99]"
        data-testid="site-card"
      >
        <SitePhoto path={site.thumb_public_path} type={site.site_type} className="h-24 w-24 shrink-0 rounded-xl" />
        <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
          <span>
            <span className="font-display block truncate text-lg leading-tight">
              {SITE_ICONS[site.site_type]} {ts(site.site_type)}
            </span>
            <span className="block text-xs text-muted">
              {open
                ? hours >= 24
                  ? t("openDays", { days: Math.floor(hours / 24) })
                  : t("openHours", { hours: formatNumber(hours, locale) })
                : site.cleaned_by
                  ? t("cleanedBy", { handle: site.cleaned_by })
                  : t("cleanedAnon")}
              {distanceKm != null && ` · ${t("away", { km: formatNumber(distanceKm, locale, 1) })}`}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            {open && !site.claimed && (
              <span className="font-display rounded-full bg-marigold px-2 py-0.5 text-sm text-ink">
                {t("reward", { points: formatNumber(reward, locale) })}
              </span>
            )}
            {open && site.claimed && <span className="rounded-full bg-sky-200 px-2 py-0.5 text-ink">🏃 {t("claimed")}</span>}
            {site.larvae_reported && open && <span className="rounded-full bg-blood-50 px-2 py-0.5 text-blood-700">🦟</span>}
            {!open && <span className="rounded-full bg-neem-50 px-2 py-0.5 text-neem-700">✓</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}
