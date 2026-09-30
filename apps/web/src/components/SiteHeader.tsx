import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { Logo } from "./Logo";
import { XpChip } from "./XpChip";

export function SiteHeader() {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <header className="sticky top-0 z-30 bg-ink text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
        <Link href="/" prefetch={false} className="flex min-h-11 items-center gap-2">
          <Logo />
          <span className="font-display text-xl">{t("app.name")}</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <XpChip />
          <LanguageSwitch locale={locale} label={t("app.languageLabel")} text={t("app.language")} />
        </div>
      </div>
      <div className="aedes-band h-1.5" aria-hidden="true" />
    </header>
  );
}
