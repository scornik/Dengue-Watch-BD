import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "@/lib/env";

export async function generateMetadata({ params }: PageProps<"/[locale]/about/risk">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "risk" });
  return { title: t("method") };
}

export default async function RiskMethod({ params }: PageProps<"/[locale]/about/risk">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <article className="card space-y-3">
      <h1 className="text-2xl font-bold">{t("risk.method")}</h1>
      <p className="font-bold text-amber-900">⚠️ {t("risk.layer")}</p>
      <p>{t("risk.explain")}</p>
      <p>{t("about.satellite")}</p>
      <p className="text-sm">
        <a className="font-bold text-brand-700 underline" href={`${env.sourceUrl}/blob/main/workers/satellite/README.md`}>
          workers/satellite/README.md ↗
        </a>{" "}
        ·{" "}
        <a className="font-bold text-brand-700 underline" href={`${env.sourceUrl}/blob/main/workers/satellite/weights.yaml`}>
          weights.yaml ↗
        </a>
      </p>
    </article>
  );
}
