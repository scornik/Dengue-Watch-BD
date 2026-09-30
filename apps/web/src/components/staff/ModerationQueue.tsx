"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber } from "@/lib/format";
import { SITE_TYPES, type AiLabel, type Larvae, type SiteType } from "@/lib/report/types";
import { SITE_ICONS } from "@/components/report/siteIcons";

type Item = {
  id: string;
  created_at: string;
  photo_path: string;
  site_type: SiteType;
  larvae_seen: Larvae;
  self_cleaned: boolean;
  note: string | null;
  ai_label: AiLabel;
  ai_score: number | null;
  accuracy_m: number | null;
  site_id: string;
  ward_id: number | null;
  lat: number;
  lng: number;
  report_count: number;
  url?: string;
};

type Nearby = { id: string; status: string; site_type: SiteType; report_count: number; distance_m: number };

export function ModerationQueue() {
  const t = useTranslations("mod");
  const ts = useTranslations("siteType");
  const tl = useTranslations("larvae");
  const ta = useTranslations("aiLabel");
  const locale = useLocale();
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);

  const fetchQueue = useCallback(async (): Promise<Item[]> => {
    const sb = getBrowserClient();
    const { data, error } = await sb
      .from("moderation_queue")
      .select("*")
      .order("priority")
      .order("created_at")
      .limit(50);
    if (error || !data) return [];
    const rows = data as Item[];
    const { data: signed } = await sb.storage.from("report-photos").createSignedUrls(
      rows.map((r) => r.photo_path),
      900,
    );
    const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    return rows.map((r) => ({ ...r, url: urls.get(r.photo_path) ?? undefined }));
  }, []);

  useEffect(() => {
    let alive = true;
    fetchQueue().then((rows) => alive && setItems(rows));
    return () => {
      alive = false;
    };
  }, [fetchQueue]);

  const current = items?.[idx] ?? null;

  const done = useCallback(
    (id: string, text: string) => {
      setItems((list) => (list ? list.filter((i) => i.id !== id) : list));
      setIdx((i) => Math.max(0, Math.min(i, (items?.length ?? 1) - 2)));
      setNearby(null);
      setMsg(text);
      setTimeout(() => setMsg(null), 1500);
    },
    [items],
  );

  const moderate = useCallback(
    async (decision: "approve" | "reject" | "relabel", siteType?: SiteType) => {
      if (!current || busy) return;
      setBusy(true);
      const { error } = await getBrowserClient().rpc("moderate_report", {
        p_report: current.id,
        p_decision: decision,
        p_site_type: siteType ?? null,
        p_note: null,
      });
      setBusy(false);
      if (error) setMsg(error.message);
      else done(current.id, `${t("done")} · ${decision === "relabel" && siteType ? ts(siteType) : t(decision)}`);
    },
    [current, busy, done, t, ts],
  );

  const showMerge = useCallback(async () => {
    if (!current) return;
    const { data } = await getBrowserClient().rpc("nearby_open_sites", { p_site: current.site_id, p_radius_m: 150 });
    setNearby((data as Nearby[]) ?? []);
  }, [current]);

  const merge = async (into: string) => {
    if (!current) return;
    setBusy(true);
    const { error } = await getBrowserClient().rpc("merge_sites", { p_from: current.site_id, p_into: into });
    setBusy(false);
    if (error) setMsg(error.message);
    else done(current.id, `${t("done")} · ${t("merge")}`);
  };

  // Keyboard shortcuts: A approve · R reject · 1–8 type · M merge · J/K next/prev · S skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const n = Number(k);
      if (k === "a") void moderate("approve");
      else if (k === "r") void moderate("reject");
      else if (k === "m") void showMerge();
      else if (k === "j" || k === "s") setIdx((i) => Math.min((items?.length ?? 1) - 1, i + 1));
      else if (k === "k") setIdx((i) => Math.max(0, i - 1));
      else if (n >= 1 && n <= SITE_TYPES.length) void moderate("relabel", SITE_TYPES[n - 1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moderate, showMerge, items]);

  if (items === null) return <p className="text-muted">…</p>;
  if (!current) return <p className="card text-center">{t("empty")}</p>;

  return (
    <div className="space-y-3" data-testid="mod-queue">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">{t("count", { count: formatNumber(items.length, locale) })}</span>
        <span className="hidden text-muted md:inline">{t("shortcuts")}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <figure className="overflow-hidden rounded-2xl bg-black">
          {current.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt="" className="mx-auto max-h-[60vh] object-contain" />
          ) : (
            <p className="p-8 text-center text-white">{t("photoError")}</p>
          )}
        </figure>
        <div className="card space-y-2 text-sm">
          <p className="text-lg font-bold" data-testid="mod-type">
            {SITE_ICONS[current.site_type]} {ts(current.site_type)}
          </p>
          <p>
            🦟 {tl(current.larvae_seen)} {current.self_cleaned && "· 🧽"}
          </p>
          {current.note && <p className="rounded bg-sky p-2">“{current.note}”</p>}
          <p>
            {t("ai", {
              label: ta(current.ai_label),
              score: current.ai_score == null ? "–" : formatNumber(current.ai_score, locale, 2),
            })}
          </p>
          <p className="text-muted">{t("reportedAt", { date: formatDateTime(current.created_at, locale) })}</p>
          <p className="text-muted">
            📍 {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
            {current.accuracy_m != null && ` ±${Math.round(current.accuracy_m)} m`} · W{current.ward_id ?? "?"} ·{" "}
            {current.report_count}×
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className="btn-primary" onClick={() => moderate("approve")} disabled={busy} data-testid="mod-approve">
          ✓ {t("approve")} <kbd className="text-xs opacity-70">A</kbd>
        </button>
        <button className="btn-danger" onClick={() => moderate("reject")} disabled={busy} data-testid="mod-reject">
          ✕ {t("reject")} <kbd className="text-xs opacity-70">R</kbd>
        </button>
        <button className="btn-secondary" onClick={showMerge} disabled={busy}>
          ⇄ {t("merge")} <kbd className="text-xs opacity-70">M</kbd>
        </button>
      </div>

      <fieldset>
        <legend className="field-label">{t("relabel")}</legend>
        <div className="grid grid-cols-4 gap-1">
          {SITE_TYPES.map((st, i) => (
            <button
              key={st}
              className={`chip px-2 text-xs ${st === current.site_type ? "border-brand-700 bg-brand-50" : ""}`}
              onClick={() => moderate("relabel", st)}
              disabled={busy}
            >
              <kbd className="mr-1 opacity-60">{i + 1}</kbd>
              {ts(st)}
            </button>
          ))}
        </div>
      </fieldset>

      {nearby && (
        <div className="card space-y-2">
          <p className="font-bold">{t("nearby")}</p>
          {nearby.length === 0 && <p className="text-sm text-muted">—</p>}
          {nearby.map((n) => (
            <button key={n.id} className="btn-ghost w-full justify-between text-sm" onClick={() => merge(n.id)}>
              <span>
                {SITE_ICONS[n.site_type]} {ts(n.site_type)} · {n.report_count}×
              </span>
              <span>{Math.round(n.distance_m)} m →</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          ← K
        </button>
        <span className="self-center text-sm text-muted">
          {formatNumber(idx + 1, locale)} / {formatNumber(items.length, locale)}
        </span>
        <button className="btn-ghost" onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}>
          {t("skip")} J →
        </button>
      </div>
      {msg && (
        <p role="status" className="fixed inset-x-4 bottom-24 z-40 rounded-xl bg-ink p-3 text-center text-white">
          {msg}
        </p>
      )}
    </div>
  );
}
