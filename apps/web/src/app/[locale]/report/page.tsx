import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReportFlow } from "@/components/report/ReportFlow";

export async function generateMetadata({ params }: PageProps<"/[locale]/report">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "report" });
  return { title: t("title") };
}

export default async function ReportPage({ params }: PageProps<"/[locale]/report">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportFlow />;
}
