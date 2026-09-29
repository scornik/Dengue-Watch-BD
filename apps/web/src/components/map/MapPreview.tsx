import { getTranslations } from "next-intl/server";
import { fetchSites, rpc } from "@/lib/publicApi";
import { bboxOf, geometryPath, makeViewport, project } from "@/lib/map/svg";
import { RISK_COLORS, STATUS_COLORS, type RiskLevel } from "@/lib/map/colors";

type WardFC = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: number; risk_level: RiskLevel | null }>;

/**
 * Server-rendered SVG snapshot of the map (ward risk + last-28-day sites).
 * Paints instantly on low-end phones; the interactive MapLibre map loads on tap.
 */
export async function MapPreview() {
  const t = await getTranslations("map");
  let wards: WardFC = { type: "FeatureCollection", features: [] };
  let sites: Awaited<ReturnType<typeof fetchSites>> = { type: "FeatureCollection", features: [] };
  try {
    [wards, sites] = await Promise.all([
      rpc<WardFC>("public_wards_geojson", { p_tolerance: 0.0004 }, { next: { revalidate: 900 } }),
      fetchSites({ statuses: ["new", "verified", "assigned", "cleared"], sinceDays: 28 }),
    ]);
  } catch {
    /* empty preview */
  }
  const bbox = wards.features.length ? bboxOf(wards.features.map((f) => f.geometry)) : ([90.33, 23.66, 90.5, 23.9] as [number, number, number, number]);
  const v = makeViewport(bbox, 360);
  return (
    <svg
      viewBox={`0 0 ${v.width} ${v.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full bg-[#e8eeea]"
      role="img"
      aria-label={`${t("title")}: ${t("reports", { count: sites.features.length })}`}
    >
      {wards.features.map((f) => (
        <path
          key={f.properties.id}
          d={geometryPath(v, f.geometry)}
          fill={f.properties.risk_level ? RISK_COLORS[f.properties.risk_level] : "#d1d5db"}
          fillOpacity={0.35}
          stroke="#374151"
          strokeOpacity={0.5}
          strokeWidth={0.4}
        />
      ))}
      {sites.features.map((f) => {
        const [x, y] = project(v, f.geometry.coordinates[0]!, f.geometry.coordinates[1]!);
        return (
          <circle
            key={f.properties.id}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={2.6}
            fill={STATUS_COLORS[f.properties.status]}
            stroke="#fff"
            strokeWidth={0.7}
          />
        );
      })}
    </svg>
  );
}
