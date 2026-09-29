"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const PublicMap = dynamic(() => import("./PublicMap"), {
  ssr: false,
  loading: () => <div className="h-[62vh] min-h-80 animate-pulse rounded-2xl bg-gray-200" />,
});

// Big screens with a mouse get the interactive map straight away.
const desktopQuery = "(min-width: 768px) and (pointer: fine)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(desktopQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** SVG preview first; MapLibre (≈300 KB gz + WebGL) only after a tap on phones. */
export function MapShell({ preview }: { preview: ReactNode }) {
  const t = useTranslations("map");
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(desktopQuery).matches, () => false);
  const [open, setOpen] = useState(false);
  if (open || desktop) return <PublicMap />;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative block h-[62vh] min-h-80 w-full overflow-hidden rounded-2xl ring-1 ring-gray-300"
        data-testid="map-preview"
      >
        {preview}
        <span className="absolute inset-x-4 bottom-4 flex flex-col items-center rounded-xl bg-white/95 p-3 shadow">
          <span className="font-bold text-brand-800">🗺️ {t("open")}</span>
          <span className="text-xs text-muted">{t("openHint")}</span>
        </span>
      </button>
    </div>
  );
}
