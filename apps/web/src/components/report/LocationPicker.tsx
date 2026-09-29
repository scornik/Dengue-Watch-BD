"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DHAKA, loadMaplibre, resolveStyle, webglAvailable } from "@/lib/map/maplibre";
import { formatNumber } from "@/lib/format";

export type PickedLocation = { lat: number; lng: number; accuracy: number | null };

type GeoStatus = "locating" | "ok" | "denied" | "unavailable";

/**
 * Fixed centre pin over a draggable map ("move the map, not the pin"), which is
 * easier with one thumb than dragging a small marker. Starts at the GPS fix.
 */
export default function LocationPicker({
  value,
  onChange,
}: {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
}) {
  const t = useTranslations("report");
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [geo, setGeo] = useState<GeoStatus>("locating");
  const [mapFailed, setMapFailed] = useState(false);
  const onChangeRef = useRef(onChange);
  const accuracyRef = useRef<number | null>(value?.accuracy ?? null);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 };
  const onFix = (pos: GeolocationPosition) => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
    accuracyRef.current = loc.accuracy;
    setGeo("ok");
    onChangeRef.current(loc);
    map.current?.jumpTo({ center: [loc.lng, loc.lat], zoom: 17 });
  };
  const onGeoError = (err: GeolocationPositionError) =>
    setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");

  const locate = () => {
    if (!("geolocation" in navigator)) return setGeo("unavailable");
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(onFix, onGeoError, GEO_OPTS);
  };

  useEffect(() => {
    if (!value) navigator.geolocation?.getCurrentPosition(onFix, onGeoError, GEO_OPTS);
    let cancelled = false;
    const el = container.current;
    if (!el) return;
    (webglAvailable() ? Promise.all([loadMaplibre(), resolveStyle()]) : Promise.reject(new Error("no WebGL")))
      .then(([ml, style]) => {
        if (cancelled) return;
        const m = new ml.Map({
          container: el,
          style,
          center: value ? [value.lng, value.lat] : DHAKA,
          zoom: value ? 17 : 12,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        m.touchZoomRotate.disableRotation();
        m.on("moveend", (e) => {
          // Only user moves change the location; programmatic jumps already did.
          if (!(e as { originalEvent?: unknown }).originalEvent) return;
          const c = m.getCenter();
          onChangeRef.current({ lat: c.lat, lng: c.lng, accuracy: accuracyRef.current });
        });
        map.current = m;
      })
      .catch(() => setMapFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-muted">{t("locationHint")}</p>
      <div className="relative h-[46vh] min-h-64 overflow-hidden rounded-2xl bg-gray-200 ring-1 ring-gray-300">
        <div ref={container} className="h-full w-full" data-testid="pin-map" aria-label={t("locationTitle")} />
        {/* Fixed centre pin */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow"
          width="36"
          height="48"
          viewBox="0 0 36 48"
        >
          <path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="#b91c1c" />
          <circle cx="18" cy="18" r="7" fill="#fff" />
        </svg>
        {mapFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
            {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t("locating")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite">
        <span>
          {geo === "locating" && t("locating")}
          {geo === "denied" && t("locationDenied")}
          {geo === "unavailable" && t("locationDenied")}
          {geo === "ok" && value?.accuracy != null && t("accuracy", { meters: formatNumber(value.accuracy, locale) })}
        </span>
        <button type="button" className="btn-ghost min-h-11 px-3 py-1 text-sm" onClick={() => locate()}>
          📍 {t("useMyLocation")}
        </button>
      </div>
    </div>
  );
}
