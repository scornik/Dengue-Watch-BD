"use client";

import dynamic from "next/dynamic";

// MapLibre only runs in the browser and is loaded lazily.
export const PublicMapLoader = dynamic(() => import("./PublicMap"), {
  ssr: false,
  loading: () => <div className="h-[62vh] min-h-80 animate-pulse rounded-2xl bg-gray-200" />,
});
