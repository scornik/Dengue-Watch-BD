import { fetchPublicSites, exportHeaders, SITE_COLUMNS } from "@/lib/export";
import { toCsv } from "@/lib/csv";

export const revalidate = 3600;

export async function GET() {
  try {
    const rows = await fetchPublicSites();
    return new Response(toCsv(rows, [...SITE_COLUMNS]), {
      headers: exportHeaders("text/csv; charset=utf-8", "denguewatch-sites.csv"),
    });
  } catch {
    return new Response("export unavailable", { status: 503 });
  }
}
