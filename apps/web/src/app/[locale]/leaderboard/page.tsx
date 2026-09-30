import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/game/Avatar";
import { MyRankRow } from "@/components/game/MyRankRow";
import { select, type LeaderRow } from "@/lib/publicApi";
import { formatNumber } from "@/lib/format";
import { levelFor } from "@/lib/game/rules";

export const revalidate = 60;

const PODIUM = [
  { place: 1, height: "h-28", ring: "ring-marigold" },
  { place: 2, height: "h-20", ring: "ring-sky-200" },
  { place: 3, height: "h-14", ring: "ring-marigold-700/40" },
] as const;

export default async function LeaderboardPage({ params, searchParams }: PageProps<"/[locale]/leaderboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const week = (await searchParams).all === undefined;
  const t = await getTranslations("board");
  const tl = await getTranslations("level");
  const tm = await getTranslations("me");
  const n = (v: number) => formatNumber(v, locale);

  const rankCol = week ? "rank_week" : "rank";
  const rows = await select<LeaderRow[]>(
    "public_leaderboard",
    `select=handle,avatar_path,points,points_week,cleans,reports,rank,rank_week${week ? "&points_week=gt.0" : "&points=gt.0"}&order=${rankCol},handle&limit=50`,
    { next: { revalidate: 60 } },
  ).catch(() => [] as LeaderRow[]);
  const score = (r: LeaderRow) => (week ? r.points_week : r.points);
  const place = (r: LeaderRow) => (week ? r.rank_week : r.rank);
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="space-y-5">
      <section className="-mx-4 -mt-4 bg-ink px-5 pb-5 pt-6 text-white">
        <h1 className="text-3xl">🏆 {t("title")}</h1>
        <nav className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-white/10 p-1" aria-label={t("title")}>
          {[
            { href: "/leaderboard", on: week, label: t("week") },
            { href: "/leaderboard?all", on: !week, label: t("all") },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              aria-current={tab.on ? "page" : undefined}
              className={`font-display flex min-h-11 items-center justify-center rounded-full ${
                tab.on ? "bg-marigold text-ink" : "text-white/85"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {top.length > 0 && (
          <ol className="mt-6 grid grid-cols-3 items-end gap-2" aria-label={t("title")}>
            {PODIUM.map(({ place: p, height, ring }) => {
              const r = top[p - 1];
              if (!r) return <li key={p} aria-hidden="true" />;
              return (
                <li key={p} className={`flex flex-col items-center ${p === 1 ? "order-2" : p === 2 ? "order-1" : "order-3"}`}>
                  {p === 1 && (
                    <span aria-hidden="true" className="text-2xl">
                      👑
                    </span>
                  )}
                  <span className={`rounded-full ring-4 ${ring}`}>
                    <Avatar handle={r.handle} path={r.avatar_path} size={p === 1 ? 72 : 56} />
                  </span>
                  <span className="mt-1 max-w-full truncate text-sm font-bold">{r.handle}</span>
                  <span className="font-display text-marigold">{t("xp", { points: n(score(r)) })}</span>
                  <span
                    className={`aedes-band mt-2 flex w-full items-start justify-center rounded-t-2xl pt-1 ${height}`}
                    aria-label={`#${n(place(r))}`}
                  >
                    <span className="font-display rounded-full bg-ink px-2 text-xl text-white">{n(place(r))}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <MyRankRow week={week} />

      {rows.length === 0 ? (
        <div className="card space-y-3 text-center">
          <p className="text-muted">{t("empty")}</p>
          <Link href="/sites" prefetch={false} className="btn-hunt">
            🪣 {t("join")}
          </Link>
        </div>
      ) : (
        rest.length > 0 && (
          <ol className="card divide-y divide-sky-200 p-0" data-testid="leaderboard">
            {rest.map((r) => (
              <li key={r.handle} className="flex items-center gap-3 px-4 py-3">
                <span className="font-display w-8 text-center text-lg text-muted">{n(place(r))}</span>
                <Avatar handle={r.handle} path={r.avatar_path} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.handle}</span>
                  <span className="block text-xs text-muted">
                    {tl(levelFor(r.points).key)} · 🪣 {n(r.cleans)} {tm("cleans")} · 📸 {n(r.reports)}
                  </span>
                </span>
                <span className="font-display text-ink">{t("xp", { points: n(score(r)) })}</span>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}
