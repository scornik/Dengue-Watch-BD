import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { select, PUBLIC_SITE_COLUMNS, type PublicSite } from "@/lib/publicApi";
import { SitesList } from "@/components/sites/SitesList";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/sites">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sites" });
  return { title: t("title") };
}

export default async function SitesPage({ params }: PageProps<"/[locale]/sites">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sites");
  const initial = await select<PublicSite[]>(
    "public_sites",
    `select=${PUBLIC_SITE_COLUMNS}&status=in.(new,verified,assigned)&order=first_reported_at.desc&limit=31`,
    { next: { revalidate: 60 } },
  ).catch(() => []);
  return (
    <div className="space-y-3">
      <h1 className="text-3xl">{t("title")}</h1>
      <SitesList initial={initial} />
    </div>
  );
}
