"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Icon } from "./Icon";

const items = [
  { href: "/", key: "home", icon: "home" },
  { href: "/map", key: "map", icon: "map" },
  { href: "/report", key: "report", icon: "plus" },
  { href: "/sites", key: "hunt", icon: "target" },
  { href: "/me", key: "me", icon: "user" },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav
      aria-label="primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sky-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5 items-end">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const isReport = it.key === "report";
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                // No background prefetch: saves data on slow mobile connections.
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                <span
                  className={
                    isReport
                      ? "-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-blood text-white shadow-[0_4px_0_0_var(--color-blood-700)] ring-4 ring-white"
                      : `flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-marigold-50" : ""}`
                  }
                >
                  <Icon name={it.icon} size={isReport ? 28 : 22} stroke={isReport ? 2.6 : 2} />
                </span>
                {t(it.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
