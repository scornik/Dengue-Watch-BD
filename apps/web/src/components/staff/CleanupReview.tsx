"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { SiteType } from "@/lib/report/types";
import { SITE_ICONS } from "@/components/report/siteIcons";

type Row = {
  id: string;
  site_id: string;
  done_at: string;
  points: number;
  note: string | null;
  after_photo_path: string;
  handle: string | null;
  site_type: SiteType;
  ward_id: number | null;
  before_photo_path: string | null;
  distance_m: number | null;
  before?: string;
  after?: string;
};

/** Volunteer cleanups are live immediately; moderators spot-check the proof and reverse fakes. */
export function CleanupReview() {
  const t = useTranslations("mod");
  const th = useTranslations("hunt");
  const ts = useTranslations("siteType");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = getBrowserClient();
      const { data } = await sb.from("cleanup_review_queue").select("*").order("done_at", { ascending: false }).limit(30);
      const list = (data ?? []) as Row[];
      const sign = async (bucket: string, paths: string[]) => {
        if (!paths.length) return new Map<string, string>();
        const { data: s } = await sb.storage.from(bucket).createSignedUrls(paths, 900);
        return new Map((s ?? []).map((x) => [x.path ?? "", x.signedUrl ?? ""]));
      };
      const [before, after] = await Promise.all([
        sign("report-photos", list.flatMap((r) => (r.before_photo_path ? [r.before_photo_path] : []))),
        sign("cleanup-photos", list.map((r) => r.after_photo_path)),
      ]);
      if (alive)
        setRows(
          list.map((r) => ({
            ...r,
            before: (r.before_photo_path && before.get(r.before_photo_path)) || undefined,
            after: after.get(r.after_photo_path) || undefined,
          })),
        );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const reject = async (id: string) => {
    setBusy(id);
    const { error } = await getBrowserClient().rpc("reject_cleanup", { p_cleanup: id, p_note: null });
    setBusy(null);
    if (!error) setRows((r) => r?.filter((x) => x.id !== id) ?? r);
  };

  if (rows === null) return <div className="h-40 animate-pulse rounded-3xl bg-sky-200" aria-busy="true" />;
  if (!rows.length) return <p className="card text-muted">{t("noCleanups")}</p>;

  return (
    <ul className="space-y-4" data-testid="cleanup-review">
      {rows.map((r) => (
        <li key={r.id} className="card space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              [th("before"), r.before],
              [th("after"), r.after],
            ].map(([label, url]) => (
              <figure key={label} className="overflow-hidden rounded-2xl bg-sky">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={label} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-sm text-muted">{t("photoError")}</div>
                )}
                <figcaption className="px-2 py-1 text-xs font-bold">{label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="text-sm">
            {SITE_ICONS[r.site_type]} {ts(r.site_type)} · {formatDateTime(r.done_at, locale)}
          </p>
          <p className="text-sm font-bold">
            {t("cleanupBy", { handle: r.handle ?? "—", meters: formatNumber(Number(r.distance_m ?? 0), locale) })} ·{" "}
            {th("points", { points: formatNumber(r.points, locale) })}
          </p>
          {r.note && <p className="text-sm text-muted">“{r.note}”</p>}
          <button type="button" className="btn-danger w-full" disabled={busy === r.id} onClick={() => reject(r.id)}>
            {t("rejectCleanup")}
          </button>
        </li>
      ))}
    </ul>
  );
}
