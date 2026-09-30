import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HunterCard } from "@/components/game/HunterCard";
import { MyReports } from "@/components/MyReports";

export default async function MePage({ params }: PageProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("me");
  return (
    <div className="space-y-5">
      <h1 className="sr-only">{t("title")}</h1>
      <HunterCard />
      <section className="space-y-3" aria-labelledby="my-reports-h">
        <h2 id="my-reports-h" className="text-xl">
          {t("myReports")}
        </h2>
        <MyReports />
      </section>
      <p className="text-center text-sm">
        <Link href="/staff" prefetch={false} className="text-muted underline">
          {t("staff")}
        </Link>
      </p>
    </div>
  );
}
