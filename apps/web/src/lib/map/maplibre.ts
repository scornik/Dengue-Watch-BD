// Lazy MapLibre loader shared by the report pin picker and the public map.
import { env } from "@/lib/env";

export const DHAKA: [number, number] = [90.4125, 23.8103];
export const DHAKA_BOUNDS: [[number, number], [number, number]] = [
  [90.25, 23.6],
  [90.6, 23.95],
];

type MaplibreModule = typeof import("maplibre-gl");
let loading: Promise<MaplibreModule> | null = null;

export function loadMaplibre(): Promise<MaplibreModule> {
  loading ??= import("maplibre-gl").then((m) => {
    m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    return m;
  });
  return loading;
}

export const mapStyleUrl = () => env.mapStyleUrl;

type Style = import("maplibre-gl").StyleSpecification;

/** Minimal offline style: our own layers still render if the tile server is unreachable. */
export const FALLBACK_STYLE: Style = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e8eeea" } }],
};

let stylePromise: Promise<Style> | null = null;

/** Fetch the base-map style once (6 s timeout), falling back to FALLBACK_STYLE. */
export function resolveStyle(): Promise<Style> {
  stylePromise ??= fetch(env.mapStyleUrl, { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? (r.json() as Promise<Style>) : FALLBACK_STYLE))
    .catch(() => {
      stylePromise = null; // retry next time
      return FALLBACK_STYLE;
    });
  return stylePromise;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
