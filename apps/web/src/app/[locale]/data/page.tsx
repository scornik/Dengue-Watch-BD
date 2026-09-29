import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResearchDownload } from "@/components/ResearchDownload";

export async function generateMetadata({ params }: PageProps<"/[locale]/data">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "data" });
  return { title: t("title") };
}

export default async function DataPage({ params }: PageProps<"/[locale]/data">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("data");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="card">{t("body")}</p>
      <div className="grid gap-2">
        {/* Plain <a>: these are file downloads served by route handlers. */}
        <a href="/api/export/sites.csv" className="btn-primary" download>
          ⬇ {t("csv")}
        </a>
        <a href="/api/export/sites.geojson" className="btn-primary" download>
          ⬇ {t("geojson")}
        </a>
      </div>
      <div className="card space-y-2">
        <ResearchDownload />
      </div>
      <p className="text-xs text-muted">
        CSV: id, lat, lng, ward_id, status, site_type, larvae_reported, report_count, first_reported_at, verified_at,
        cleared_at, closed_at · ODbL-1.0
      </p>
    </div>
  );
}
