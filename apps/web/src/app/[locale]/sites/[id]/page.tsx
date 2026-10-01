import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { select, PUBLIC_SITE_COLUMNS, type PublicSite } from "@/lib/publicApi";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SitePhoto } from "@/components/sites/SiteCard";
import { Icon } from "@/components/Icon";
import { HuntPanel } from "@/components/sites/HuntPanel";
import { SITE_ICONS } from "@/components/report/siteIcons";

export const revalidate = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  const [site] = await select<PublicSite[]>("public_sites", `select=${PUBLIC_SITE_COLUMNS}&id=eq.${id}`, {
    next: { revalidate: 30 },
  });
  return site ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/sites/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const site = await load(id).catch(() => null);
  if (!site) return {};
  const t = await getTranslations({ locale, namespace: "siteType" });
  return { title: t(site.site_type) };
}

export default async function SitePage({ params }: PageProps<"/[locale]/sites/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const site = await load(id);
  if (!site) notFound();
  const t = await getTranslations("hunt");
  const ts = await getTranslations("siteType");
  const tsi = await getTranslations("sites");
  const tm = await getTranslations("map");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <figure className="overflow-hidden rounded-2xl bg-white ring-1 ring-sky-200">
          <SitePhoto path={site.thumb_public_path} type={site.site_type} className="aspect-square w-full" />
          <figcaption className="px-2 py-1 text-xs font-bold text-blood-700">{t("before")}</figcaption>
        </figure>
        <figure className="overflow-hidden rounded-2xl bg-white ring-1 ring-sky-200">
          {site.status === "cleared" ? (
            <SitePhoto path={site.after_thumb_path} type={site.site_type} className="aspect-square w-full" />
          ) : (
            <span className="aedes-band-soft flex aspect-square w-full items-center justify-center text-4xl" aria-hidden="true">
              ?
            </span>
          )}
          <figcaption className="px-2 py-1 text-xs font-bold text-neem-700">{t("after")}</figcaption>
        </figure>
      </div>
      {!site.thumb_public_path && <p className="text-xs text-muted">{tsi("noPhoto")}</p>}

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl">
            {SITE_ICONS[site.site_type]} {ts(site.site_type)}
          </h1>
          <p className="text-sm text-muted">
            {t("reportedOn", { date: formatDate(site.first_reported_at, locale) })}
            {site.larvae_reported && ` · 🦟 ${tm("larvaeSeen")}`}
          </p>
          {site.cleaned_by && <p className="mt-1 font-bold text-neem-700">✓ {tsi("cleanedBy", { handle: site.cleaned_by })}</p>}
        </div>
        <StatusBadge status={site.status} />
      </div>
      <p className="text-xs text-muted">{tm("approx")}</p>

      <HuntPanel site={site} />

      <div className="grid grid-cols-2 gap-2">
        <Link href="/sites" prefetch={false} className="btn-ghost whitespace-nowrap">
          <Icon name="back" /> {tsi("title")}
        </Link>
        {site.ward_id && (
          <Link href={`/ward/${site.ward_id}`} prefetch={false} className="btn-ghost">
            {tm("wardPage")}
          </Link>
        )}
      </div>
    </div>
  );
}
