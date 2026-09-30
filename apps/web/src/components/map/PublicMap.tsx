"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DHAKA, loadMaplibre, resolveStyle, webglAvailable } from "@/lib/map/maplibre";
import { REPORT_BUCKETS, RISK_COLORS, RISK_LEVELS, STATUS_COLORS, type MapMode } from "@/lib/map/colors";
import { fetchSites, rpc, type SiteFeatureProps } from "@/lib/publicApi";
import { publicStorageUrl } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { SITE_STATUSES, SITE_TYPES, type SiteStatus, type SiteType } from "@/lib/report/types";
import { getPathname } from "@/i18n/navigation";

const RISK_FILL = [
  "match",
  ["coalesce", ["get", "risk_level"], "none"],
  ...RISK_LEVELS.flatMap((l) => [l, RISK_COLORS[l]]),
  "#d1d5db",
] as unknown as ExpressionSpecification;
const REPORTS_FILL = [
  "step",
  ["coalesce", ["get", "reports_28d"], 0],
  REPORT_BUCKETS[0].color,
  ...REPORT_BUCKETS.slice(1).flatMap((b) => [b.min, b.color]),
] as unknown as ExpressionSpecification;

const PUBLIC_STATUSES = SITE_STATUSES.filter((s) => s !== "rejected");

export default function PublicMap() {
  const t = useTranslations("map");
  const tr = useTranslations("risk");
  const ts = useTranslations("status");
  const tt = useTranslations("siteType");
  const locale = useLocale();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [statuses, setStatuses] = useState<SiteStatus[]>(["new", "verified", "assigned", "cleared"]);
  const [type, setType] = useState<SiteType | "">("");
  const [since, setSince] = useState<number | null>(28);
  const [showSites, setShowSites] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [mode, setMode] = useState<MapMode>("reports");
  const [count, setCount] = useState<number | null>(null);
  const [noBoundaries, setNoBoundaries] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keep latest translations for popups created inside map callbacks.
  const tsi = useTranslations("sites");
  const th = useTranslations("hunt");
  const labels = useRef({ t, ts, tt, tsi, th, locale });
  useEffect(() => {
    labels.current = { t, ts, tt, tsi, th, locale };
  }, [t, ts, tt, tsi, th, locale]);

  useEffect(() => {
    let cancelled = false;
    const container = el.current;
    if (!container) return;
    // Let the page (text, legend, cases) become interactive first, then start the map.
    const idle = () =>
      new Promise<void>((r) => {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
          .requestIdleCallback;
        if (ric) ric(() => r(), { timeout: 2000 });
        else setTimeout(r, 300);
      });
    idle()
      .then(() => (webglAvailable() ? Promise.all([loadMaplibre(), resolveStyle()]) : Promise.reject(new Error("no WebGL"))))
      .then(([ml, style]) => {
        if (cancelled) return;
        const m = new ml.Map({
          container,
          style,
          center: DHAKA,
          zoom: 11,
          attributionControl: { compact: true },
          dragRotate: false,
        });
        m.touchZoomRotate.disableRotation();
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.GeolocateControl({ trackUserLocation: false }), "top-right");
        map.current = m;

        m.on("load", () => {
          m.addSource("wards", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({
            id: "ward-fill",
            type: "fill",
            source: "wards",
            paint: {
              "fill-color": REPORTS_FILL,
              "fill-opacity": 0.55,
            },
          });
          m.addLayer({
            id: "ward-line",
            type: "line",
            source: "wards",
            paint: { "line-color": "#1b1f3b", "line-width": 0.6, "line-opacity": 0.5 },
          });

          m.addSource("sites", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            cluster: true,
            clusterRadius: 40,
            clusterMaxZoom: 15,
          });
          m.addLayer({
            id: "clusters",
            type: "circle",
            source: "sites",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#1b1f3b",
              "circle-opacity": 0.85,
              "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 2,
            },
          });
          // Cluster labels need the base style's glyphs (absent in the offline fallback).
          if (style.glyphs) m.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "sites",
            filter: ["has", "point_count"],
            layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
            paint: { "text-color": "#fff" },
          });
          m.addLayer({
            id: "sites",
            type: "circle",
            source: "sites",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "match",
                ["get", "status"],
                ...SITE_STATUSES.flatMap((s) => [s, STATUS_COLORS[s]]),
                "#6b7280",
              ] as unknown as ExpressionSpecification,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 9],
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1.5,
            },
          });

          m.on("click", "clusters", async (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const src = m.getSource("sites") as GeoJSONSource;
            const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
            m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
          });
          m.on("click", "sites", (e) => {
            const f = e.features?.[0];
            if (f) new ml.Popup({ maxWidth: "260px" }).setLngLat(e.lngLat).setDOMContent(sitePopup(f)).addTo(m);
          });
          m.on("click", "ward-fill", (e) => {
            if (m.queryRenderedFeatures(e.point, { layers: ["sites", "clusters"] }).length) return;
            const f = e.features?.[0];
            if (f) new ml.Popup({ maxWidth: "240px" }).setLngLat(e.lngLat).setDOMContent(wardPopup(f)).addTo(m);
          });
          for (const layer of ["clusters", "sites", "ward-fill"]) {
            m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
          }
          setReady(true);
        });
      })
      .catch(() => setFailed(true));

    function sitePopup(f: MapGeoJSONFeature): HTMLElement {
      const { t, ts, tt, locale } = labels.current;
      const p = f.properties as unknown as SiteFeatureProps;
      const div = document.createElement("div");
      div.className = "space-y-1 text-sm";
      if (p.thumb && p.thumb !== "null") {
        const img = document.createElement("img");
        img.src = publicStorageUrl("public-thumbs", p.thumb);
        img.alt = "";
        img.className = "mb-1 h-32 w-full rounded object-cover";
        div.append(img);
      }
      const title = document.createElement("p");
      title.className = "font-bold";
      title.textContent = `${tt(p.site_type)} · ${ts(p.status)}`;
      const meta = document.createElement("p");
      meta.textContent = `${t("reports", { count: Number(p.report_count) })} · ${t("reported", { date: formatDate(p.first_reported_at, locale) })}`;
      div.append(title, meta);
      if (p.cleared_at && p.cleared_at !== "null") {
        const c = document.createElement("p");
        c.textContent = t("clearedOn", { date: formatDate(p.cleared_at, locale) });
        div.append(c);
      }
      if (p.cleaned_by && p.cleaned_by !== "null") {
        const c = document.createElement("p");
        c.className = "font-bold text-neem-700";
        c.textContent = `🪣 ${labels.current.tsi("cleanedBy", { handle: p.cleaned_by })}`;
        div.append(c);
      } else if (String(p.claimed) === "true") {
        const c = document.createElement("p");
        c.className = "font-bold";
        c.textContent = `🏃 ${labels.current.tsi("claimed")}`;
        div.append(c);
      }
      if (String(p.larvae) === "true") {
        const l = document.createElement("p");
        l.textContent = `🦟 ${t("larvaeSeen")}`;
        div.append(l);
      }
      const approx = document.createElement("p");
      approx.className = "text-xs text-muted";
      approx.textContent = t("approx");
      div.append(approx);
      const more = document.createElement("a");
      more.href = getPathname({ href: `/sites/${p.id}`, locale });
      more.className = "btn-hunt mt-1 min-h-10 w-full text-sm";
      more.textContent = ["new", "verified", "assigned"].includes(p.status) ? `🪣 ${labels.current.th("claim")}` : `${t("details")} →`;
      div.append(more);
      if (p.ward_id && String(p.ward_id) !== "null") div.append(wardLink(Number(p.ward_id)));
      return div;
    }

    function wardPopup(f: MapGeoJSONFeature): HTMLElement {
      const { locale } = labels.current;
      const { t } = labels.current;
      const p = f.properties as {
        id: number;
        name_bn: string;
        name_en: string;
        risk_level?: string;
        reports_28d?: number;
        open_sites?: number;
      };
      const div = document.createElement("div");
      div.className = "space-y-1 text-sm";
      const title = document.createElement("p");
      title.className = "font-bold";
      title.textContent = locale === "bn" ? p.name_bn : p.name_en;
      const risk = document.createElement("p");
      const lvl = p.risk_level && p.risk_level !== "null" ? p.risk_level : null;
      risk.textContent = `${tr("layer")}: ${lvl ? tr(lvl as "green") : tr("none")}`;
      const reps = document.createElement("p");
      reps.textContent = `📸 ${t("wardReports", { count: Number(p.reports_28d ?? 0) })} · ${t("wardOpen", { count: Number(p.open_sites ?? 0) })}`;
      div.append(title, reps, risk, wardLink(Number(p.id)));
      return div;
    }

    function wardLink(id: number): HTMLElement {
      const { t, locale } = labels.current;
      const a = document.createElement("a");
      a.href = getPathname({ href: `/ward/${id}`, locale });
      a.className = "block font-bold text-ink underline";
      a.textContent = `${t("wardPage")} →`;
      return a;
    }

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [tr]);

  // Wards (once)
  useEffect(() => {
    if (!ready) return;
    rpc<GeoJSON.FeatureCollection>("public_wards_geojson", {})
      .then((fc) => {
        (map.current?.getSource("wards") as GeoJSONSource | undefined)?.setData(fc);
        setNoBoundaries(fc.features.length === 0);
      })
      .catch(() => setNoBoundaries(true));
  }, [ready]);

  // Sites (on filter change)
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetchSites({ statuses, types: type ? [type] : undefined, sinceDays: since })
      .then((fc) => {
        if (!alive) return;
        (map.current?.getSource("sites") as GeoJSONSource | undefined)?.setData(fc);
        setCount(fc.features.length);
      })
      .catch(() => alive && setCount(null));
    return () => {
      alive = false;
    };
  }, [ready, statuses, type, since]);

  // Layer visibility
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const id of ["ward-fill", "ward-line"]) m.setLayoutProperty(id, "visibility", showRisk ? "visible" : "none");
    for (const id of ["clusters", "cluster-count", "sites"]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", showSites ? "visible" : "none");
    }
  }, [ready, showRisk, showSites]);

  // Ward shading: citizen reports (default) or environmental risk
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setPaintProperty("ward-fill", "fill-color", mode === "reports" ? REPORTS_FILL : RISK_FILL);
    m.setPaintProperty("ward-fill", "fill-opacity", mode === "reports" ? 0.55 : 0.35);
  }, [ready, mode]);

  const toggleStatus = (s: SiteStatus) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t("layers")} className="grid grid-cols-2 gap-1 rounded-full bg-ink p-1" data-testid="map-mode">
        {(
          [
            ["reports", `📸 ${t("modeReports")}`],
            ["risk", `🛰️ ${t("modeRisk")}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={mode === k}
            onClick={() => setMode(k)}
            className={`font-display min-h-11 rounded-full text-sm ${mode === k ? "bg-marigold text-ink" : "text-white/85"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative h-[62vh] min-h-80 overflow-hidden rounded-3xl bg-sky-200 ring-1 ring-sky-200">
        <div ref={el} className="h-full w-full" data-testid="public-map" role="region" aria-label={t("title")} />
        {!ready && !failed && (
          <p className="absolute inset-0 flex items-center justify-center text-muted">{t("loading")}</p>
        )}
        {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center">⚠️</p>}
        {count !== null && (
          <p className="absolute left-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold shadow" data-testid="site-count">
            {t("reports", { count })}
          </p>
        )}
      </div>

      {mode === "risk" && <p className="rounded-xl bg-marigold-50 p-2 text-sm font-bold text-ink">⚠️ {tr("layer")}</p>}
      {noBoundaries && <p className="text-sm text-muted">{t("noBoundaries")}</p>}

      <button
        type="button"
        className="btn-secondary w-full"
        aria-expanded={filtersOpen}
        aria-controls="map-filters"
        onClick={() => setFiltersOpen((o) => !o)}
      >
        ⚙️ {t("filters")}
      </button>

      <div id="map-filters" hidden={!filtersOpen} className="card space-y-4">
        <fieldset>
          <legend className="field-label">{t("layers")}</legend>
          <div className="flex flex-wrap gap-2">
            <label className="chip">
              <input type="checkbox" className="sr-only" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} />
              {t("sites")}
            </label>
            <label className="chip">
              <input type="checkbox" className="sr-only" checked={showRisk} onChange={(e) => setShowRisk(e.target.checked)} />
              {mode === "reports" ? t("modeReports") : t("wardRisk")}
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend className="field-label">{t("status")}</legend>
          <div className="flex flex-wrap gap-2">
            {PUBLIC_STATUSES.map((s) => (
              <label key={s} className="chip gap-2">
                <input type="checkbox" className="sr-only" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                {ts(s)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t("type")}</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as SiteType | "")}>
              <option value="">{t("all")}</option>
              {SITE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {tt(st)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">{t("since")}</span>
            <select
              className="input"
              value={since ?? ""}
              onChange={(e) => setSince(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="7">{t("last7")}</option>
              <option value="28">{t("last28")}</option>
              <option value="90">{t("last90")}</option>
              <option value="">{t("all")}</option>
            </select>
          </label>
        </div>
      </div>

      <section className="card" aria-labelledby="legend-h">
        <h2 id="legend-h" className="field-label">
          {t("legend")}
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {PUBLIC_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-1">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[s] }} />
              {ts(s)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs font-bold">{mode === "reports" ? t("reportsLegend") : tr("layer")}</p>
        {mode === "reports" ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="legend-reports">
            {REPORT_BUCKETS.map((b) => (
              <li key={b.min} className="flex items-center gap-1">
                <span aria-hidden="true" className="h-3 w-5 rounded-sm ring-1 ring-ink/20" style={{ background: b.color }} />
                {b.label}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="legend-risk">
            {RISK_LEVELS.map((l) => (
              <li key={l} className="flex items-center gap-1">
                <span aria-hidden="true" className="h-3 w-5 rounded-sm opacity-70" style={{ background: RISK_COLORS[l] }} />
                {tr(l)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
