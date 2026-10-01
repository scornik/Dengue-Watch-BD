"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CREATOR } from "@/lib/creator";

function Photo({ size }: { size: number }) {
  const t = useTranslations("creator");
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden
        className="font-display flex shrink-0 items-center justify-center rounded-full bg-ink text-white"
        style={{ width: size, height: size, fontSize: size * 0.32 }}
      >
        {CREATOR.initials}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CREATOR.photo}
      alt={t("photoAlt", { name: CREATOR.name })}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full border-2 border-ink object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** Full card for /about and /contact. */
export function CreatorCard() {
  const t = useTranslations("creator");
  return (
    <section id="creator" className="card flex items-center gap-4" aria-labelledby="creator-h" data-testid="creator-card">
      <Photo size={80} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted">{t("title")}</p>
        <h2 id="creator-h" className="font-display text-xl font-bold">
          {CREATOR.name}
        </h2>
        <p className="text-sm">{t("role")}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
          <a href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
            {t("linkedin")}
          </a>
          <a href={`mailto:${CREATOR.email}`} className="text-brand-700 underline">
            {t("email")}
          </a>
        </div>
      </div>
    </section>
  );
}

/** One line for the footer: photo, "Made by <name>", LinkedIn. */
export function CreatorCredit() {
  const t = useTranslations("creator");
  return (
    <a
      href={CREATOR.linkedin}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2 text-sm text-muted"
      data-testid="creator-credit"
    >
      <Photo size={32} />
      <span>
        {t("madeBy")} <span className="font-bold text-ink underline">{CREATOR.name}</span>
      </span>
    </a>
  );
}
