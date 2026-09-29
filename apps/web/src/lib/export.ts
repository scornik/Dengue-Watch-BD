import "server-only";
import { env } from "@/lib/env";

export const SITE_COLUMNS = [
  "id", "lat", "lng", "ward_id", "status", "site_type", "larvae_reported", "report_count",
  "first_reported_at", "verified_at", "cleared_at", "closed_at",
] as const;

/** All public (snapped, anonymised) sites, paged through PostgREST. */
export async function fetchPublicSites(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; from < 200_000; from += page) {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/public_sites?select=${SITE_COLUMNS.join(",")}&order=first_reported_at.desc`,
      {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${env.supabaseAnonKey}`,
          Range: `${from}-${from + page - 1}`,
        },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) throw new Error(`public_sites ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export const exportHeaders = (type: string, filename: string) => ({
  "Content-Type": type,
  "Content-Disposition": `attachment; filename="${filename}"`,
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "Access-Control-Allow-Origin": "*",
  "X-License": "ODbL-1.0 (derived from DengueWatch BD citizen reports)",
});
