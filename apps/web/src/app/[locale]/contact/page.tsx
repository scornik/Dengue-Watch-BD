import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactForm } from "@/components/ContactForm";
import { CreatorCard } from "@/components/CreatorCard";
import { CREATOR } from "@/lib/creator";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title") };
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <ContactForm />
      <section className="card space-y-1" aria-labelledby="email-h">
        <h2 id="email-h" className="text-lg font-bold">
          {t("emailTitle")}
        </h2>
        <p className="text-muted">{t("emailBody")}</p>
        <a href={`mailto:${CREATOR.email}`} className="font-bold text-brand-700 underline" data-testid="contact-email">
          {CREATOR.email}
        </a>
      </section>
      <CreatorCard />
    </div>
  );
}
