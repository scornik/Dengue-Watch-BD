"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { claimSite, finishCleanup, myClaim, myStats, releaseClaim, type Claim, type MyStats } from "@/lib/game/client";
import { levelFor, rewardFor } from "@/lib/game/rules";
import { preparePhoto } from "@/lib/image/compress";
import { distanceM, getPosition, navigationLinks } from "@/lib/geo";
import { formatNumber } from "@/lib/format";
import { HandleForm } from "@/components/game/HandleForm";
import { StripeBar } from "@/components/game/StripeBar";
import type { PublicSite } from "@/lib/publicApi";

// Public coordinates are snapped to ~50 m, so the phone can only estimate; the
// server checks the exact 50 m rule against the true point.
const CLIENT_SLACK_M = 90;

type Phase = "loading" | "idle" | "needHandle" | "claimed" | "done";

export function HuntPanel({ site }: { site: PublicSite }) {
  const t = useTranslations("hunt");
  const tl = useTranslations("level");
  const locale = useLocale();
  const camera = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [stats, setStats] = useState<MyStats | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [after, setAfter] = useState<{ blob: Blob; url: string; lat: number; lng: number; dist: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [earned, setEarned] = useState<{ points: number; before: number } | null>(null);
  const [now] = useState(() => Date.now());
  const open = site.status === "new" || site.status === "verified" || site.status === "assigned";
  const reward = rewardFor({ larvae: site.larvae_reported, firstReportedAt: site.first_reported_at }, now);
  const nav = navigationLinks(site.lat, site.lng);

  useEffect(() => {
    let alive = true;
    Promise.all([myStats().catch(() => null), myClaim(site.id).catch(() => null)]).then(([s, c]) => {
      if (!alive) return;
      setStats(s);
      setClaim(c);
      setPhase(c?.status === "claimed" && new Date(c.expires_at).getTime() > Date.now() ? "claimed" : "idle");
    });
    return () => {
      alive = false;
    };
  }, [site.id]);

  const doClaim = async () => {
    setMsg(null);
    if (!stats?.handle) return setPhase("needHandle");
    setBusy(true);
    const r = await claimSite(site.id);
    setBusy(false);
    if (r.claim) {
      setClaim(r.claim);
      setPhase("claimed");
    } else if (r.error === "errHandle") setPhase("needHandle");
    else setMsg(t(r.error ?? "errGeneric"));
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg(t("checking"));
    try {
      const [prepared, pos] = await Promise.all([preparePhoto(file), getPosition()]);
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const dist = Math.round(distanceM(here, site));
      setAfter({ blob: prepared.blob, url: prepared.url, ...here, dist });
      setMsg(dist > CLIENT_SLACK_M ? t("tooFar", { meters: formatNumber(dist, locale) }) : null);
    } catch {
      setMsg(t("errGps"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!claim || !after) return;
    setBusy(true);
    setMsg(null);
    const before = stats?.points ?? 0;
    const r = await finishCleanup(claim, after.blob, after);
    setBusy(false);
    if (r.claim) {
      setEarned({ points: r.claim.points, before });
      setPhase("done");
      window.scrollTo(0, 0);
    } else setMsg(t(r.error ?? "errGeneric", { meters: formatNumber(after.dist, locale) }));
  };

  if (phase === "done" && earned) {
    const lvlBefore = levelFor(earned.before);
    const lvl = levelFor(earned.before + earned.points);
    return (
      <section className="rounded-3xl bg-ink p-6 text-center text-white" data-testid="hunt-done">
        <p className="text-5xl" aria-hidden="true">
          🪣✨
        </p>
        <h2 className="mt-2 text-3xl">{t("done")}</h2>
        <p className="font-display animate-pop mt-2 text-5xl text-marigold">{t("points", { points: formatNumber(earned.points, locale) })}</p>
        {lvl.n > lvlBefore.n && <p className="mt-2 font-bold">🎉 {t("levelUp", { level: tl(lvl.key) })}</p>}
        <div className="mt-4 text-left">
          <p className="mb-1 text-sm text-white/80">
            {tl("label", { n: formatNumber(lvl.n, locale) })} · {tl(lvl.key)}
          </p>
          <StripeBar value={lvl.progress} label={tl(lvl.key)} tone="dark" />
        </div>
        <div className="mt-5 grid gap-2">
          <Link href="/sites" className="btn-hunt">
            {t("backToList")}
          </Link>
          <Link href="/me" className="btn-secondary">
            ★ {formatNumber(earned.before + earned.points, locale)} XP
          </Link>
        </div>
      </section>
    );
  }

  if (!open) return null;

  return (
    <section className="space-y-3" aria-live="polite">
      <div className="rounded-2xl bg-marigold-50 p-4 ring-1 ring-marigold/40">
        <h2 className="text-xl">{t("rewardTitle")}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {reward.lines.map((l) => (
            <li key={l.key} className="flex justify-between">
              <span>{t(l.key)}</span>
              <span className="font-display">+{formatNumber(l.points, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="font-display mt-2 flex justify-between border-t border-marigold/40 pt-2 text-lg">
          <span>XP</span>
          <span>+{formatNumber(reward.total, locale)}</span>
        </p>
      </div>

      {phase === "loading" && <div className="h-16 animate-pulse rounded-2xl bg-sky-200" />}

      {phase === "idle" &&
        (site.claimed ? (
          <p className="rounded-2xl bg-white p-4 text-center font-bold ring-1 ring-sky-200">🏃 {t("errClaimed")}</p>
        ) : (
          <button className="btn-hunt min-h-16 w-full text-lg" onClick={doClaim} disabled={busy} data-testid="claim">
            🪣 {t("claim")}
          </button>
        ))}

      {phase === "needHandle" && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-sky-200">
          <HandleForm
            initial={stats?.handle}
            onSaved={(handle) => {
              setStats((s) => ({ ...(s ?? { avatar_path: null, points: 0, points_week: 0, cleans: 0, reports: 0, rank: null, active_claims: 0 }), handle }));
              setPhase("idle");
            }}
          />
        </div>
      )}

      {phase === "claimed" && claim && (
        <div className="space-y-3">
          <p className="rounded-2xl bg-neem-50 p-3 text-sm font-bold text-neem-700">
            ✓{" "}
            {t("claimedByYou", {
              time: new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" }).format(
                new Date(claim.expires_at),
              ),
            })}
          </p>
          <a href={nav.geo} className="btn-secondary w-full">
            🧭 {t("navigate")}
          </a>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-sky-200">
            <h2 className="text-xl">{t("howTitle")}</h2>
            <ol className="mt-2 space-y-2 text-sm">
              {(["how1", "how2", "how3"] as const).map((k, i) => (
                <li key={k} className="flex gap-2">
                  <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-white">
                    {formatNumber(i + 1, locale)}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-sm text-muted">{t("atSpot")}</p>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onPhoto}
            aria-label={t("takeAfter")}
            data-testid="after-photo"
          />
          {after && (
            <figure className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after.url} alt="" className="max-h-64 w-full rounded-2xl object-cover" />
              <figcaption
                className={`absolute bottom-2 left-2 rounded-full px-3 py-1 text-sm font-bold ${after.dist > CLIENT_SLACK_M ? "bg-blood text-white" : "bg-neem text-white"}`}
                data-testid="distance"
              >
                {t("distanceOk", { meters: formatNumber(after.dist, locale) })}
              </figcaption>
            </figure>
          )}
          <button className="btn-primary w-full" disabled={busy} onClick={() => camera.current?.click()}>
            📷 {t("takeAfter")}
          </button>
          <button
            className="btn-hunt min-h-16 w-full text-lg"
            disabled={busy || !after || after.dist > CLIENT_SLACK_M}
            onClick={confirm}
            data-testid="confirm-clean"
          >
            ✓ {t("confirm")}
          </button>
          <button
            className="btn-ghost w-full text-sm"
            onClick={async () => {
              await releaseClaim(claim.id);
              setClaim(null);
              setPhase("idle");
            }}
          >
            {t("release")}
          </button>
        </div>
      )}

      {msg && (
        <p role="status" className="rounded-2xl bg-ink p-3 text-center font-bold text-white">
          {msg}
        </p>
      )}
    </section>
  );
}
