"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const items = [
  { href: "/", key: "home", icon: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" },
  { href: "/map", key: "map", icon: "M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" },
  { href: "/report", key: "report", icon: "M12 5v14M5 12h14" },
  { href: "/sites", key: "hunt", icon: "M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { href: "/me", key: "me", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
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
                  <svg
                    aria-hidden="true"
                    width={isReport ? 28 : 22}
                    height={isReport ? 28 : 22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isReport ? 2.6 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={it.icon} />
                  </svg>
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
