"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listQueue, listSent, onQueueChange, type QueueItem, type SentItem } from "@/lib/queue/db";
import { flushQueue } from "@/lib/queue/flush";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { SITE_ICONS } from "@/components/report/siteIcons";
import type { SiteStatus, SiteType } from "@/lib/report/types";
import { StatusBadge } from "@/components/StatusBadge";

type ServerRow = { id: string; created_at: string; site_type: SiteType; site: { status: SiteStatus } | null };

export function MyReports() {
  const t = useTranslations("mine");
  const ts = useTranslations("siteType");
  const locale = useLocale();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sent, setSent] = useState<SentItem[]>([]);
  const [server, setServer] = useState<Record<string, ServerRow>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [q, s] = await Promise.all([listQueue(), listSent()]);
    return { q, s };
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      load().then(({ q, s }) => {
        if (!alive) return;
        setQueue(q);
        setSent(s);
      });
    refresh();
    const off = onQueueChange(refresh);
    // Status of sent reports (RLS: a reporter can read their own reports).
    getBrowserClient()
      .from("reports")
      .select("id, created_at, site_type, site:sites(status)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!alive || !data) return;
        setServer(Object.fromEntries((data as unknown as ServerRow[]).map((r) => [r.id, r])));
      });
    return () => {
      alive = false;
      off();
    };
  }, [load]);

  if (!queue.length && !sent.length && !Object.keys(server).length) {
    return <p className="card text-muted">{t("empty")}</p>;
  }

  const sentIds = new Set(sent.map((s) => s.id));
  const serverOnly = Object.values(server).filter((r) => !sentIds.has(r.id));

  return (
    <div className="space-y-4">
      {queue.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">
            ⏳ {t("pending")} ({queue.length})
          </h2>
          <ul className="divide-y">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {SITE_ICONS[q.meta.site_type]} {ts(q.meta.site_type)} · {formatDateTime(q.meta.client_created_at, locale)}
                </span>
                {q.state === "failed" && <span className="text-red-700">✕</span>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await flushQueue();
              setBusy(false);
            }}
          >
            {t("retry")}
          </button>
        </section>
      )}
      <ul className="space-y-2">
        {sent.map((s) => (
          <li key={s.id} className="card flex items-center gap-3">
            {s.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.thumb} alt="" className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-50 text-2xl">
                {SITE_ICONS[s.siteType as SiteType] ?? "💧"}
              </span>
            )}
            <div className="flex-1">
              <p className="font-bold">{ts(s.siteType as SiteType)}</p>
              <p className="text-xs text-muted">{t("sent", { date: formatDateTime(new Date(s.sentAt), locale) })}</p>
            </div>
            {server[s.id]?.site && <StatusBadge status={server[s.id]!.site!.status} />}
          </li>
        ))}
        {serverOnly.map((r) => (
          <li key={r.id} className="card flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-50 text-2xl">
              {SITE_ICONS[r.site_type]}
            </span>
            <div className="flex-1">
              <p className="font-bold">{ts(r.site_type)}</p>
              <p className="text-xs text-muted">{t("sent", { date: formatDateTime(r.created_at, locale) })}</p>
            </div>
            {r.site && <StatusBadge status={r.site.status} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
