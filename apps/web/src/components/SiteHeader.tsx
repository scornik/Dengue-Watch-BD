import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";

export function SiteHeader() {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <header className="sticky top-0 z-30 bg-brand-700 text-white shadow">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
        <Link href="/" prefetch={false} className="flex min-h-11 items-center gap-2 text-lg font-bold" aria-label={t("nav.home")}>
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="15" fill="#fff" />
            <path d="M16 6c-4 6-7 9.5-7 13a7 7 0 0 0 14 0c0-3.5-3-7-7-13z" fill="#047857" />
          </svg>
          <span>{t("app.name")}</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="secondary">
          <Link href="/staff" prefetch={false} className="hidden min-h-11 items-center rounded px-2 hover:bg-brand-800 sm:inline-flex">
            {t("nav.staff")}
          </Link>
          <LanguageSwitch locale={locale} label={t("app.languageLabel")} text={t("app.language")} />
        </nav>
      </div>
    </header>
  );
}
