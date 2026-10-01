"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/game/Avatar";
import { HandleForm } from "@/components/game/HandleForm";
import { StripeBar } from "@/components/game/StripeBar";
import { bumpXp, myStats, uploadAvatar, type MyStats } from "@/lib/game/client";
import { BADGES, levelFor } from "@/lib/game/rules";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/format";
import { Icon } from "@/components/Icon";

async function fetchCard() {
  const stats = await myStats().catch(() => null);
  const sb = getBrowserClient();
  const { data } = await sb.auth.getUser();
  let rankWeek: number | null = null;
  if (stats?.handle) {
    const { data: lb } = await sb
      .from("public_leaderboard")
      .select("rank_week, points_week")
      .eq("handle", stats.handle)
      .maybeSingle();
    rankWeek = lb && lb.points_week > 0 ? lb.rank_week : null;
  }
  return { stats, anonymous: !!data.user?.is_anonymous, rankWeek };
}

export function HunterCard() {
  const t = useTranslations("me");
  const tl = useTranslations("level");
  const tb = useTranslations("badge");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const n = (v: number) => formatNumber(v, locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<MyStats | null | undefined>(undefined);
  const [rankWeek, setRankWeek] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const apply = (c: Awaited<ReturnType<typeof fetchCard>>) => {
    setStats(c.stats);
    setAnonymous(c.anonymous);
    setRankWeek(c.rankWeek);
  };
  const load = () => fetchCard().then(apply);
  useEffect(() => {
    let alive = true;
    fetchCard().then((c) => alive && apply(c));
    return () => {
      alive = false;
    };
  }, []);

  if (stats === undefined) return <div className="h-72 animate-pulse rounded-3xl bg-sky-200" aria-busy="true" />;

  if (!stats?.handle) {
    return (
      <section className="overflow-hidden rounded-3xl bg-white ring-1 ring-sky-200">
        <div className="aedes-band h-3" aria-hidden="true" />
        <div className="space-y-3 p-5">
          <h2 className="text-2xl">🦟 {t("setupTitle")}</h2>
          <p className="text-muted">{t("setupBody")}</p>
          <HandleForm
            onSaved={() => {
              bumpXp();
              void load();
            }}
          />
        </div>
      </section>
    );
  }

  const lvl = levelFor(stats.points);
  const badgeStats = {
    points: stats.points,
    pointsWeek: stats.points_week,
    cleans: stats.cleans,
    reports: stats.reports,
    rankWeek,
    streakWeeks: stats.streak_weeks,
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhotoBusy(true);
    const path = await uploadAvatar(f).catch(() => null);
    setPhotoBusy(false);
    if (path) setStats((s) => (s ? { ...s, avatar_path: path } : s));
  };

  const share = async () => {
    const url = `${window.location.origin}/${locale === "bn" ? "" : "en/"}leaderboard`;
    const text = `${stats.handle} · ${tl(lvl.key)} · ${n(stats.points)} XP · 🪣 ${n(stats.cleans)} — DengueWatch BD`;
    if (navigator.share) await navigator.share({ title: "DengueWatch BD", text, url }).catch(() => {});
    else await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-ink text-white shadow-lg" data-testid="hunter-card">
        <div className="aedes-band h-3" aria-hidden="true" />
        <div className="flex items-center gap-4 p-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative shrink-0 rounded-full"
            aria-label={t("photo")}
            disabled={photoBusy}
          >
            <Avatar handle={stats.handle} path={stats.avatar_path} size={88} />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-marigold text-ink"
            >
              {photoBusy ? "…" : "📷"}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} data-testid="avatar-input" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-marigold">{tl("label", { n: n(lvl.n) })}</p>
            <h2 className="truncate text-2xl" data-testid="hunter-handle">
              {stats.handle}
            </h2>
            <p className="text-white/80">{tl(lvl.key)}</p>
            <button type="button" className="mt-1 text-xs text-white/70 underline" onClick={() => setEditing((v) => !v)}>
              ✏️ {t("handle")}
            </button>
          </div>
        </div>
        <div className="px-5 pb-5">
          <StripeBar value={lvl.progress} label={tl(lvl.key)} tone="dark" />
          <p className="mt-1 text-xs text-white/75">
            {lvl.next ? t("nextLevel", { xp: n(lvl.toNext), level: tl(lvl.next.key) }) : t("maxLevel")}
            {stats.points_pending > 0 && <> · {t("pending", { xp: n(stats.points_pending) })}</>}
          </p>
          <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              { v: stats.points, k: t("xp"), c: "text-marigold" },
              { v: stats.cleans, k: t("cleans"), c: "" },
              { v: stats.reports, k: t("reports"), c: "" },
              { v: stats.rank ?? 0, k: t("rank"), c: "", pre: "#" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl bg-white/10 py-2">
                <dt className="sr-only">{s.k}</dt>
                <dd className={`font-display text-2xl leading-none ${s.c}`}>
                  {s.pre}
                  {n(s.v)}
                </dd>
                <dd className="mt-1 text-[0.7rem] text-white/75">{s.k}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="px-5 pb-3 text-[0.7rem] text-white/60">{t("photoHint")}</p>
      </section>

      <section className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-sky-200" data-testid="streak">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${stats.streak_weeks > 0 ? "bg-blood text-white" : "bg-sky text-muted"}`}
        >
          <Icon name="flame" size={26} />
        </span>
        <span className="min-w-0">
          <span className="font-display block text-lg">{t("streak", { weeks: stats.streak_weeks })}</span>
          <span className="block text-xs text-muted">{t("streakHint")}</span>
          <span className="block text-xs text-muted">
            {t("limits", { cleans: n(stats.tier_cleans), claims: n(stats.tier_claims) })}
          </span>
        </span>
      </section>

      {editing && (
        <div className="card">
          <HandleForm
            initial={stats.handle}
            onSaved={(h) => {
              setEditing(false);
              setStats((s) => (s ? { ...s, handle: h } : s));
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={share} className="btn-secondary">
          <Icon name="share" /> {t("shareShort")}
        </button>
        <Link href="/leaderboard" prefetch={false} className="btn-secondary">
          <Icon name="trophy" /> {tn("leaderboard")}
        </Link>
      </div>

      <section className="card" aria-labelledby="badges-h">
        <h2 id="badges-h" className="text-xl">
          {t("badges")}
        </h2>
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {BADGES.map((b) => {
            const on = b.earned(badgeStats);
            return (
              <li
                key={b.key}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-center text-xs ${
                  on ? "bg-marigold-50 font-bold ring-2 ring-marigold" : "bg-sky text-muted"
                }`}
                data-earned={on}
              >
                <span aria-hidden="true" className={`text-3xl ${on ? "animate-pop" : "opacity-40 grayscale"}`}>
                  {b.icon}
                </span>
                <span>{tb(b.key)}</span>
                <span className="sr-only">{on ? "✓" : "—"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {anonymous && <KeepProgress />}
    </div>
  );
}

/** Link an email to the anonymous account so the card survives a new phone. */
function KeepProgress() {
  const t = useTranslations("me");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await getBrowserClient().auth.updateUser({ email: email.trim().toLowerCase() });
    setBusy(false);
    setErr(!!error);
    if (!error) setStep("code");
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await getBrowserClient().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email_change",
    });
    setBusy(false);
    setErr(!!error);
    if (!error) setStep("done");
  };

  return (
    <section className="card space-y-2" aria-labelledby="keep-h">
      <h2 id="keep-h" className="text-lg">
        🔒 {t("keepTitle")}
      </h2>
      {step === "done" ? (
        <p role="status" className="font-bold text-neem-700">
          ✓ {t("keepDone")}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">{t("keepBody")}</p>
          {step === "email" ? (
            <form onSubmit={send} className="flex gap-2">
              <label className="sr-only" htmlFor="keep-email">
                {t("email")}
              </label>
              <input
                id="keep-email"
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email")}
                autoComplete="email"
              />
              <button className="btn-primary shrink-0" disabled={busy}>
                {t("sendCode")}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="flex gap-2">
              <label className="sr-only" htmlFor="keep-code">
                {t("code")}
              </label>
              <input
                id="keep-code"
                inputMode="numeric"
                required
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("code")}
                autoComplete="one-time-code"
              />
              <button className="btn-primary shrink-0" disabled={busy}>
                {t("verify")}
              </button>
            </form>
          )}
          {err && (
            <p role="alert" className="text-sm text-blood-700">
              {t("keepError")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
