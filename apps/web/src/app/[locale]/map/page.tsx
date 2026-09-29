import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PublicMapLoader } from "@/components/map/PublicMapLoader";
import { CasesPanel } from "@/components/map/CasesPanel";

export const revalidate = 900;

export async function generateMetadata({ params }: PageProps<"/[locale]/map">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "map" });
  return { title: t("title") };
}

export default async function MapPage({ params }: PageProps<"/[locale]/map">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("map.title")}</h1>
      <PublicMapLoader />
      <CasesPanel />
      <div className="grid grid-cols-2 gap-2">
        <Link href="/ward" className="btn-secondary">
          {t("ward.allWards")}
        </Link>
        <Link href="/about/risk" className="btn-ghost">
          {t("risk.method")}
        </Link>
      </div>
    </div>
  );
}
