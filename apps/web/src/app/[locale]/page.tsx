import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { QueueBadge } from "@/components/QueueBadge";
import { HomeStats } from "@/components/HomeStats";
import { Suspense } from "react";

export const revalidate = 300;

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const ta = await getTranslations("app");
  const tn = await getTranslations("nav");
  const tw = await getTranslations("ward");

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-800 p-6 text-white shadow">
        <h1 className="text-2xl font-bold leading-snug">{ta("tagline")}</h1>
        <Link
          href="/report"
          className="btn mt-5 w-full bg-white text-lg text-brand-800 hover:bg-brand-50"
          data-testid="cta-report"
        >
          📷 {t("cta")}
        </Link>
        <p className="mt-2 text-center text-sm text-brand-50">{t("ctaHint")}</p>
        <QueueBadge />
      </section>

      <Suspense fallback={null}>
        <HomeStats />
      </Suspense>

      <section className="card">
        <h2 className="text-lg font-bold">{t("howTitle")}</h2>
        <ol className="mt-3 space-y-3">
          {(["step1", "step2", "step3", "step4"] as const).map((k, i) => (
            <li key={k} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800"
              >
                {(i + 1).toLocaleString(locale === "bn" ? "bn-BD" : "en")}
              </span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card border-l-4 border-l-amber-500">
        <h2 className="text-lg font-bold">{t("cleanTitle")}</h2>
        <p className="mt-1 text-muted">{t("cleanBody")}</p>
      </section>

      <Link href="/map" className="btn-secondary w-full">
        🗺️ {t("mapLink")}
      </Link>

      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("emergency")}</p>

      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-sm text-muted">
        <Link href="/about" prefetch={false} className="underline">
          {tn("about")}
        </Link>
        <Link href="/data" prefetch={false} className="underline">
          {tn("data")}
        </Link>
        <Link href="/ward" prefetch={false} className="underline">
          {tw("allWards")}
        </Link>
        <Link href="/staff" prefetch={false} className="underline">
          {tn("staff")}
        </Link>
      </footer>
    </div>
  );
}
