"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/format";
import { useLocale } from "next-intl";

/** Header XP counter. Only loads supabase-js when this browser already has a session. */
export function XpChip() {
  const locale = useLocale();
  const [xp, setXp] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const ref = new URL(env.supabaseUrl).hostname.split(".")[0];
    let hasSession = false;
    try {
      hasSession = !!localStorage.getItem(`sb-${ref}-auth-token`);
    } catch {
      /* private mode */
    }
    const load = () =>
      import("@/lib/supabase/client")
        .then(({ getBrowserClient }) => getBrowserClient().rpc("my_stats"))
        .then(({ data }) => {
          const row = Array.isArray(data) ? data[0] : null;
          if (alive && row) setXp(row.points ?? 0);
        })
        .catch(() => {});
    // A first-time hunter has no session yet; the "dw:xp" event after their first points loads it.
    if (hasSession) void load();
    window.addEventListener("dw:xp", load);
    return () => {
      alive = false;
      window.removeEventListener("dw:xp", load);
    };
  }, []);
  if (xp === null) return null;
  return (
    <Link
      href="/me"
      prefetch={false}
      className="font-display inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full bg-marigold px-2.5 text-sm text-ink"
      data-testid="xp-chip"
    >
      <span aria-hidden="true">★</span>
      {formatNumber(xp, locale)}
      <span className="sr-only min-[400px]:not-sr-only"> XP</span>
    </Link>
  );
}
