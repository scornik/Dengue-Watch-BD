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

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
