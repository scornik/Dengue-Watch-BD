"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/game/Avatar";
import { formatNumber } from "@/lib/format";
import type { LeaderRow } from "@/lib/publicApi";

/** "You" row on the leaderboard; only shown to a browser that already has a hunter name. */
export function MyRankRow({ week }: { week: boolean }) {
  const t = useTranslations("board");
  const locale = useLocale();
  const [me, setMe] = useState<LeaderRow | null>(null);
  useEffect(() => {
    let alive = true;
    import("@/lib/game/client")
      .then(({ myStats }) => myStats())
      .then(async (s) => {
        if (!s?.handle) return;
        const { getBrowserClient } = await import("@/lib/supabase/client");
        const { data } = await getBrowserClient()
          .from("public_leaderboard")
          .select("handle,avatar_path,points,points_week,cleans,reports,rank,rank_week")
          .eq("handle", s.handle)
          .maybeSingle();
        if (alive && data) setMe(data as LeaderRow);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!me) return null;
  const n = (v: number) => formatNumber(v, locale);
  return (
    <Link
      href="/me"
      prefetch={false}
      className="flex items-center gap-3 rounded-2xl bg-marigold-50 px-4 py-3 ring-2 ring-marigold"
      data-testid="my-rank"
    >
      <span className="font-display w-8 text-center text-lg">{n(week ? me.rank_week : me.rank)}</span>
      <Avatar handle={me.handle} path={me.avatar_path} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{me.handle}</span>
        <span className="block text-xs text-muted">{t("you")}</span>
      </span>
      <span className="font-display">{t("xp", { points: n(week ? me.points_week : me.points) })}</span>
    </Link>
  );
}
