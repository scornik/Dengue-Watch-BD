import { getTranslations, setRequestLocale } from "next-intl/server";
import { MyReports } from "@/components/MyReports";

export default async function MinePage({ params }: PageProps<"/[locale]/mine">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("mine");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <MyReports />
    </div>
  );
}
