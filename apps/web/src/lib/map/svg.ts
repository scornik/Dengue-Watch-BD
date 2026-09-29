// Tiny equirectangular projection for the server-rendered SVG map preview.
type Pos = number[];
type Geom = { type: string; coordinates: unknown };

export type Viewport = { minX: number; minY: number; maxX: number; maxY: number; k: number; width: number; height: number };

/** Fit a lon/lat bbox into a width-wide SVG, correcting longitude by cos(lat). */
export function makeViewport(bbox: [number, number, number, number], width = 360): Viewport {
  const [w, s, e, n] = bbox;
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const spanX = (e - w) * k;
  const spanY = n - s;
  return { minX: w, minY: s, maxX: e, maxY: n, k, width, height: Math.round((width * spanY) / spanX) };
}

export function project(v: Viewport, lng: number, lat: number): [number, number] {
  const sx = v.width / ((v.maxX - v.minX) * v.k);
  return [((lng - v.minX) * v.k * sx), ((v.maxY - lat) * sx)];
}

function ringPath(v: Viewport, ring: Pos[]): string {
  return (
    ring
      .map((p, i) => {
        const [x, y] = project(v, p[0]!, p[1]!);
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join("") + "Z"
  );
}

/** SVG path "d" for a Polygon or MultiPolygon. */
export function geometryPath(v: Viewport, g: Geom): string {
  if (g.type === "Polygon") return (g.coordinates as Pos[][]).map((r) => ringPath(v, r)).join("");
  if (g.type === "MultiPolygon") return (g.coordinates as Pos[][][]).flat().map((r) => ringPath(v, r)).join("");
  return "";
}

/** Bounding box of polygon features (falls back to Dhaka). */
export function bboxOf(geoms: Geom[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      w = Math.min(w, c[0] as number);
      e = Math.max(e, c[0] as number);
      s = Math.min(s, c[1] as number);
      n = Math.max(n, c[1] as number);
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  geoms.forEach((g) => visit(g.coordinates));
  return Number.isFinite(w) ? [w, s, e, n] : [90.33, 23.66, 90.5, 23.9];
}
