import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { QueueBadge } from "@/components/QueueBadge";
import { StripeBar } from "@/components/game/StripeBar";
import { Avatar } from "@/components/game/Avatar";
import { select, type LeaderRow, type Scorecard } from "@/lib/publicApi";
import { formatNumber } from "@/lib/format";

export const revalidate = 300;

async function loadHome() {
  const opts = { next: { revalidate: 300 } };
  const [cards, hunters] = await Promise.all([
    select<Pick<Scorecard, "sites_28d" | "cleared_28d">[]>("public_ward_scorecard", "select=sites_28d,cleared_28d", opts).catch(
      () => [],
    ),
    select<LeaderRow[]>(
      "public_leaderboard",
      "select=handle,avatar_path,points_week,rank_week&points_week=gt.0&order=rank_week&limit=3",
      opts,
    ).catch(() => []),
  ]);
  const found = cards.reduce((a, c) => a + (c.sites_28d ?? 0), 0);
  const destroyed = cards.reduce((a, c) => a + (c.cleared_28d ?? 0), 0);
  return { found, destroyed, hunters };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tn = await getTranslations("nav");
  const tw = await getTranslations("ward");
  const tb = await getTranslations("board");
  const { found, destroyed, hunters } = await loadHome();
  const n = (v: number) => formatNumber(v, locale);

  return (
    <div className="space-y-5">
      <section className="-mx-4 -mt-4 bg-ink px-5 pb-6 pt-7 text-white">
        <h1 className="text-[2.1rem] leading-tight">{t("heroTitle")}</h1>
        <p className="mt-2 max-w-md text-white/80">{t("heroSub")}</p>
        <div className="mt-5 flex items-end justify-between gap-4">
          <p>
            <span className="font-display block text-4xl text-marigold">{n(destroyed)}</span>
            <span className="text-sm text-white/80">{t("destroyed")}</span>
          </p>
          <p className="text-right">
            <span className="font-display block text-4xl">{n(found)}</span>
            <span className="text-sm text-white/80">{t("found")}</span>
          </p>
        </div>
        <div className="mt-3">
          <StripeBar value={found ? destroyed / found : 0} label={`${t("destroyed")} / ${t("found")}`} tone="dark" />
        </div>
        <p className="mt-2 text-xs text-white/70">{t("period")}</p>
      </section>

      <div className="grid gap-3">
        <Link href="/report" prefetch={false} className="btn-report min-h-16 text-lg" data-testid="cta-report">
          📷 {t("reportCta")}
        </Link>
        <Link href="/sites" prefetch={false} className="btn-hunt min-h-16 text-lg" data-testid="cta-hunt">
          🪣 {t("huntCta")}
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/map" prefetch={false} className="btn-secondary" data-testid="cta-map">
            🗺️ {t("mapBtn")}
          </Link>
          <Link href="/sites" prefetch={false} className="btn-secondary" data-testid="cta-list">
            📋 {t("listBtn")}
          </Link>
        </div>
        <QueueBadge />
      </div>

      <section className="rounded-3xl bg-white p-4 ring-1 ring-sky-200" aria-labelledby="top-h">
        <div className="flex items-baseline justify-between">
          <h2 id="top-h" className="text-xl">
            {t("topHunters")}
          </h2>
          <Link href="/leaderboard" prefetch={false} className="text-sm font-bold text-ink underline">
            {tb("title")}
          </Link>
        </div>
        {hunters.length === 0 ? (
          <p className="mt-2 text-muted">{t("noHunters")}</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {hunters.map((h, i) => (
              <li key={h.handle} className="flex items-center gap-3">
                <span className="font-display w-6 text-center text-xl text-marigold-700">{n(i + 1)}</span>
                <Avatar handle={h.handle} path={h.avatar_path} size={40} />
                <span className="flex-1 truncate font-bold">{h.handle}</span>
                <span className="font-display text-ink">{tb("xp", { points: n(h.points_week) })}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-3xl bg-white p-4 ring-1 ring-sky-200" aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl">
          {t("howTitle")}
        </h2>
        <ol className="mt-3 space-y-3">
          {(["play1", "play2", "play3"] as const).map((k, i) => (
            <li key={k} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
                  ["bg-blood", "bg-neem", "bg-marigold text-ink"][i]
                }`}
              >
                {n(i + 1)}
              </span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="rounded-2xl bg-marigold-50 p-3 text-sm text-ink">{t("emergency")}</p>

      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-sm text-muted">
        <Link href="/about" prefetch={false} className="underline">
          {tn("about")}
        </Link>
        <Link href="/data" prefetch={false} className="underline">
          {tn("data")}
        </Link>
        <Link href="/ward" prefetch={false} className="underline">
          {tw("allWards")}
        </Link>
        <Link href="/staff" prefetch={false} className="underline">
          {tn("staff")}
        </Link>
      </footer>
    </div>
  );
}
