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
      title={label}
      lang={other}
      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-white/40 px-2.5 font-bold hover:bg-ink-700"
    >
      {text}
    </Link>
  );
}
