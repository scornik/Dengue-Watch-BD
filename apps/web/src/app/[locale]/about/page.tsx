import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { CreatorCard } from "@/components/CreatorCard";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title") };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="space-y-4">
      <article className="card space-y-3">
      <h1 className="text-2xl font-bold">{t("about.title")}</h1>
      <p>{t("about.body")}</p>
      <p className="font-bold">{t("about.satellite")}</p>
      <ul className="list-inside list-disc space-y-1">
        <li>
          <Link href="/about/risk" className="text-brand-700 underline">
            {t("risk.method")}
          </Link>
        </li>
        <li>
          <Link href="/data" className="text-brand-700 underline">
            {t("nav.data")}
          </Link>
        </li>
        <li>
          {/* AGPL-3.0 §13: offer the source to network users. */}
          <a href={env.sourceUrl} className="text-brand-700 underline" rel="noopener noreferrer">
            {t("about.source")} ({t("app.license")})
          </a>
        </li>
        <li>
          <Link href="/contact" className="text-brand-700 underline">
            {t("nav.contact")}
          </Link>
        </li>
        <li>
          <a href={`${env.sourceUrl}/blob/main/docs/credits.md`} className="text-brand-700 underline" rel="noopener noreferrer">
            {t("about.credits")}
          </a>
        </li>
      </ul>
      </article>
      <CreatorCard />
    </div>
  );
}
