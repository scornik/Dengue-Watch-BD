"use client";

import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageSwitch({ locale, label, text }: { locale: string; label: string; text: string }) {
  const pathname = usePathname();
  const params = useParams();
  const other = locale === "bn" ? "en" : "bn";
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      href={{ pathname, params } as any}
      locale={other}
      prefetch={false}
      aria-label={label}
      lang={other}
      className="inline-flex min-h-11 items-center rounded-lg border border-white/40 px-3 font-bold hover:bg-brand-800"
    >
      {text}
    </Link>
  );
}
