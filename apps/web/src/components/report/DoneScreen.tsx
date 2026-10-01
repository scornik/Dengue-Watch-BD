"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PushOptIn } from "@/components/PushOptIn";
import { makeShareCard } from "@/lib/share/card";
import { env } from "@/lib/env";
import type { SiteType } from "@/lib/report/types";
import { RULES } from "@/lib/game/rules";
import { SITE_ICONS } from "./siteIcons";

export type DoneState = "sent" | "queued" | "limited" | "otp";

export function DoneScreen({
  state,
  type,
  cleaned,
  siteId,
}: {
  state: DoneState;
  type: SiteType;
  cleaned: boolean;
  siteId?: string;
}) {
  const t = useTranslations("done");
  const tr = useTranslations("report");
  const ta = useTranslations("app");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const shareUrl = env.siteUrl;

  const shareText = async () => {
    const data = { title: ta("name"), text: t("shareText"), url: shareUrl };
    if (navigator.share) {
      await navigator.share(data).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${data.text} ${data.url}`)}`, "_blank", "noopener");
    }
  };

  const shareImage = async () => {
    const blob = await makeShareCard({
      title: ta("tagline"),
      line: t("shareText"),
      footer: `${ta("name")} · ${shareUrl.replace(/^https?:\/\//, "")}`,
      icon: SITE_ICONS[type],
    });
    const file = new File([blob], "denguewatch.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${t("shareText")} ${shareUrl}` }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "denguewatch.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setShareMsg("✓");
    }
  };

  const heading =
    state === "sent" ? t("title") : state === "limited" ? tr("rateLimited") : state === "otp" ? tr("otpRequired") : t("queuedTitle");
  const body = state === "sent" ? t("body") : state === "queued" ? t("queuedBody") : tr("errorGeneric");

  return (
    <div className="space-y-4">
      <section className="card text-center" data-testid="done" data-state={state}>
        <div aria-hidden="true" className="text-6xl">
          {state === "sent" ? "✅" : "⏳"}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{heading}</h1>
        <p className="mt-1 text-muted">{body}</p>
        {state === "sent" && (
          <p className="font-display animate-pop mt-3 inline-block rounded-full bg-marigold px-4 py-1 text-lg text-ink" data-testid="done-xp">
            ★ {t("pointsLater", { points: RULES.report })}
          </p>
        )}
      </section>

      {state === "sent" && siteId && !cleaned && (
        <Link href={`/sites/${siteId}`} prefetch={false} className="btn-hunt min-h-14 w-full" data-testid="done-clean-now">
          🪣 {t("cleanNow")}
        </Link>
      )}

      <section className="card border-l-4 border-l-marigold">
        <h2 className="font-bold">{cleaned ? t("cleanTitle") : t("tipsTitle")}</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
          <li>{t("tip1")}</li>
          <li>{t("tip2")}</li>
          <li>{t("tip3")}</li>
          <li>{t("tip4")}</li>
        </ul>
      </section>

      <PushOptIn />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={shareText}>
          {t("share")}
        </button>
        <button type="button" className="btn-secondary" onClick={shareImage}>
          {t("shareCard")} {shareMsg}
        </button>
      </div>
      <a href="" className="btn-primary w-full" onClick={(e) => (e.preventDefault(), window.location.reload())}>
        📷 {t("another")}
      </a>
      <Link href="/mine" className="btn-ghost w-full">
        {t("track")}
      </Link>
    </div>
  );
}
