"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { preparePhoto } from "@/lib/image/compress";
import { CLOSE_RADIUS_M, distanceM, getPosition, navigationLinks } from "@/lib/geo";
import { formatDateTime, formatNumber } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SITE_ICONS } from "@/components/report/siteIcons";
import type { QueueSite } from "./InspectorQueue";

type Mode = "idle" | "clearing" | "notfound";

export function InspectorSite({ siteId, userId }: { siteId: string; userId: string }) {
  const t = useTranslations("insp");
  const tt = useTranslations("siteType");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const [site, setSite] = useState<QueueSite | null | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState<{ blob: Blob; url: string; lat: number; lng: number; dist: number } | null>(null);

  useEffect(() => {
    const sb = getBrowserClient();
    sb.from("inspector_queue")
      .select("*")
      .eq("id", siteId)
      .maybeSingle()
      .then(async ({ data }) => {
        const s = data as QueueSite | null;
        setSite(s);
        if (s?.photo_path) {
          const { data: signed } = await sb.storage.from("report-photos").createSignedUrl(s.photo_path, 900);
          setPhotoUrl(signed?.signedUrl ?? null);
        }
      });
  }, [siteId]);

  if (site === undefined) return <p className="text-muted">{tc("loading")}</p>;
  if (site === null) return <p className="card">{tc("notFound")}</p>;

  const nav = navigationLinks(site.lat, site.lng);

  const transition = async (to: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setMsg(null);
    const { error } = await getBrowserClient().rpc("transition_site", { p_site: site.id, p_to: to, ...extra });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return false;
    }
    setMsg(t("saved"));
    return true;
  };

  const onAfterPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      // Location at the moment of the photo, not the file's EXIF.
      const [prepared, pos] = await Promise.all([preparePhoto(file), getPosition()]);
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const dist = Math.round(distanceM(here, site));
      setAfter({ blob: prepared.blob, url: prepared.url, ...here, dist });
      if (dist > CLOSE_RADIUS_M) setMsg(t("tooFar", { meters: formatNumber(dist, locale) }));
    } catch {
      setMsg(t("gpsNeeded"));
    } finally {
      setBusy(false);
    }
  };

  const confirmCleared = async () => {
    if (!after || after.dist > CLOSE_RADIUS_M) return;
    setBusy(true);
    const path = `${site.id}/${crypto.randomUUID()}.jpg`;
    const sb = getBrowserClient();
    const up = await sb.storage.from("after-photos").upload(path, after.blob, { contentType: "image/jpeg" });
    setBusy(false);
    if (up.error) return setMsg(up.error.message);
    const ok = await transition("cleared", {
      p_photo_path: path,
      p_lat: after.lat,
      p_lng: after.lng,
      p_note: reason.trim() || null,
    });
    if (ok) router.push("/staff/inspect");
  };

  const confirmNotFound = async () => {
    if (!reason.trim()) return;
    if (await transition("not_found", { p_note: reason.trim() })) router.push("/staff/inspect");
  };

  return (
    <div className="space-y-3" data-testid="insp-site">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {SITE_ICONS[site.site_type]} {tt(site.site_type)}
        </h1>
        <StatusBadge status={site.status} />
      </div>
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="max-h-72 w-full rounded-2xl bg-black object-contain" />
      )}
      <div className="card space-y-1 text-sm">
        <p>
          {(locale === "bn" ? site.ward_name_bn : site.ward_name_en) ?? "—"} · {formatDateTime(site.first_reported_at, locale)} ·{" "}
          {site.report_count}× {site.larvae_reported && "· 🦟"}
        </p>
        {site.note && <p className="rounded bg-sky p-2">“{site.note}”</p>}
        <p className="text-muted">
          📍 {site.lat.toFixed(6)}, {site.lng.toFixed(6)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a href={nav.geo} className="btn-primary">
          🧭 {t("navigate")}
        </a>
        <a href={nav.osm} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">
          OSM ↗
        </a>
      </div>

      {(site.status === "new" || site.status === "verified") && (
        <button className="btn-secondary w-full" disabled={busy} onClick={async () => (await transition("assigned")) && setSite({ ...site, status: "assigned", assigned_to: userId })} data-testid="assign">
          {t("assign")}
        </button>
      )}
      {site.status === "assigned" && site.assigned_to === userId && (
        <button className="btn-ghost w-full" disabled={busy} onClick={async () => (await transition("verified")) && setSite({ ...site, status: "verified", assigned_to: null })}>
          {t("unassign")}
        </button>
      )}

      {mode === "idle" && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary bg-status-cleared" onClick={() => setMode("clearing")} data-testid="clear">
            ✓ {t("clear")}
          </button>
          <button className="btn-secondary" onClick={() => setMode("notfound")} data-testid="not-found">
            {t("notFound")}
          </button>
        </div>
      )}

      {mode === "clearing" && (
        <section className="card space-y-3">
          <p className="text-sm">{t("afterPhotoHint")}</p>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onAfterPhoto} data-testid="after-photo" aria-label={t("afterPhoto")} />
          <button className="btn-primary w-full" disabled={busy} onClick={() => camera.current?.click()}>
            📷 {t("afterPhoto")}
          </button>
          {after && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after.url} alt="" className="max-h-56 w-full rounded-xl object-cover" />
              <p className={after.dist > CLOSE_RADIUS_M ? "font-bold text-blood-700" : "text-brand-800"} data-testid="distance">
                {t("distance", { meters: formatNumber(after.dist, locale) })}
              </p>
            </>
          )}
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label={t("reasonLabel")} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setMode("idle")}>
              {t("cancel")}
            </button>
            <button className="btn-primary" disabled={busy || !after || after.dist > CLOSE_RADIUS_M} onClick={confirmCleared} data-testid="confirm-clear">
              {t("confirm")}
            </button>
          </div>
        </section>
      )}

      {mode === "notfound" && (
        <section className="card space-y-3">
          <label className="block">
            <span className="field-label">{t("reasonLabel")}</span>
            <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t("reasonPlaceholder")} required data-testid="reason" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setMode("idle")}>
              {t("cancel")}
            </button>
            <button className="btn-primary" disabled={busy || !reason.trim()} onClick={confirmNotFound} data-testid="confirm-notfound">
              {t("confirm")}
            </button>
          </div>
        </section>
      )}

      {msg && (
        <p role="status" className="rounded-xl bg-ink p-3 text-center text-white">
          {msg}
        </p>
      )}
      <Link href="/staff/inspect" className="btn-ghost w-full">
        ← {t("title")}
      </Link>
    </div>
  );
}
