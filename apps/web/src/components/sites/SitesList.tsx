"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { select, PUBLIC_SITE_COLUMNS, type PublicSite } from "@/lib/publicApi";
import { distanceM } from "@/lib/geo";
import { SiteCard } from "./SiteCard";

type Tab = "open" | "cleared";
const PAGE = 30;

export function SitesList({ initial }: { initial: PublicSite[] }) {
  const t = useTranslations("sites");
  const [tab, setTab] = useState<Tab>("open");
  const [rows, setRows] = useState<PublicSite[]>(initial);
  const [limit, setLimit] = useState(PAGE);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (tab === "open" && limit === PAGE && rows === initial) return;
    let alive = true;
    const status = tab === "open" ? "status=in.(new,verified,assigned)" : "status=eq.cleared";
    const order = tab === "open" ? "first_reported_at.desc" : "cleared_at.desc.nullslast";
    select<PublicSite[]>("public_sites", `select=${PUBLIC_SITE_COLUMNS}&${status}&order=${order}&limit=${here ? 500 : limit}`)
      .then((r) => alive && setRows(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, limit, here]);

  const sorted = useMemo(() => {
    const withD = rows.map((s) => ({ s, d: here ? distanceM(here, s) / 1000 : null }));
    if (here) withD.sort((a, b) => a.d! - b.d!);
    return withD.slice(0, limit);
  }, [rows, here, limit]);

  const nearest = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );

  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-sky-200">
        {(["open", "cleared"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setLimit(PAGE);
            }}
            className={`font-display min-h-11 rounded-xl text-base ${tab === k ? (k === "open" ? "bg-blood text-white" : "bg-neem text-white") : "text-muted"}`}
          >
            {k === "open" ? t("tabOpen") : t("tabCleared")}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={here ? () => setHere(null) : nearest}
          className="min-h-11 rounded-full px-3 text-sm font-bold text-ink underline"
          aria-pressed={!!here}
        >
          📍 {here ? t("sortNew") : t("sortNear")}
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-muted ring-1 ring-sky-200">{t("empty")}</p>
      ) : (
        <ul className="space-y-2" data-testid="sites-list">
          {sorted.map(({ s, d }) => (
            <SiteCard key={s.id} site={s} distanceKm={d} now={now} />
          ))}
        </ul>
      )}
      {rows.length > limit && (
        <button type="button" className="btn-secondary w-full" onClick={() => setLimit((l) => l + PAGE)}>
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
