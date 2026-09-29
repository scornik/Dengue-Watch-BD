import { fetchPublicSites, exportHeaders } from "@/lib/export";

export const revalidate = 3600;

export async function GET() {
  try {
    const rows = await fetchPublicSites();
    const fc = {
      type: "FeatureCollection",
      license: "ODbL-1.0",
      note: "Locations snapped to a ~50 m grid. No reporter information.",
      features: rows.map(({ lat, lng, ...props }) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: props,
      })),
    };
    return new Response(JSON.stringify(fc), {
      headers: exportHeaders("application/geo+json; charset=utf-8", "denguewatch-sites.geojson"),
    });
  } catch {
    return new Response("export unavailable", { status: 503 });
  }
}
