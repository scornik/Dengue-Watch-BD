// Tiny REST client for the public views/RPCs (no supabase-js on public pages).
import { env } from "@/lib/env";
import type { SiteStatus, SiteType } from "@/lib/report/types";

const headers = () => ({
  apikey: env.supabaseAnonKey,
  Authorization: `Bearer ${env.supabaseAnonKey}`,
  "Content-Type": "application/json",
});

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args),
    ...init,
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function select<T>(view: string, query: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${view}?${query}`, { headers: headers(), ...init });
  if (!res.ok) throw new Error(`${view}: ${res.status}`);
  return res.json() as Promise<T>;
}

export type SiteFeatureProps = {
  id: string;
  status: SiteStatus;
  site_type: SiteType;
  ward_id: number | null;
  report_count: number;
  larvae: boolean;
  first_reported_at: string;
  cleared_at: string | null;
  thumb: string | null;
  claimed?: boolean;
  cleaned_by?: string | null;
  after_thumb?: string | null;
};

export type SitesFilter = { statuses?: SiteStatus[]; types?: SiteType[]; sinceDays?: number | null; ward?: number };

export function fetchSites(f: SitesFilter) {
  return rpc<GeoJSON.FeatureCollection<GeoJSON.Point, SiteFeatureProps>>("public_sites_geojson", {
    p_statuses: f.statuses?.length ? f.statuses : null,
    p_types: f.types?.length ? f.types : null,
    p_since: f.sinceDays ? new Date(Date.now() - f.sinceDays * 86_400_000).toISOString() : null,
    p_ward: f.ward ?? null,
  });
}

export type Scorecard = {
  ward_id: number;
  city_corp: "DNCC" | "DSCC";
  ward_no: number;
  name_bn: string;
  name_en: string;
  sites_28d: number;
  cleared_28d: number;
  open_28d: number;
  overdue_28d: number;
  median_hours_to_clear: number | null;
  pct_cleared_72h: number | null;
};

export type PublicWard = {
  id: number;
  city_corp: "DNCC" | "DSCC";
  ward_no: number;
  name_bn: string;
  name_en: string;
  area_km2: number | null;
  has_boundary: boolean;
  risk_week: string | null;
  risk_score: number | null;
  risk_level: "green" | "yellow" | "orange" | "red" | null;
  ndvi: number | null;
  ndwi: number | null;
  ndbi: number | null;
  lst_c: number | null;
  rain_14d_mm: number | null;
  report_density: number | null;
  cases_area: number | null;
};

export type CaseCount = { date: string; area: string; admissions: number; deaths: number; source_url: string | null; manual_entry: boolean };

export type LeaderRow = {
  handle: string;
  avatar_path: string | null;
  points: number;
  points_week: number;
  cleans: number;
  reports: number;
  rank: number;
  rank_week: number;
};

export type PublicSite = {
  id: string;
  lat: number;
  lng: number;
  ward_id: number | null;
  status: SiteStatus;
  site_type: SiteType;
  larvae_reported: boolean;
  report_count: number;
  first_reported_at: string;
  cleared_at: string | null;
  thumb_public_path: string | null;
  claimed: boolean;
  cleaned_by: string | null;
  after_thumb_path: string | null;
};

export const PUBLIC_SITE_COLUMNS =
  "id,lat,lng,ward_id,status,site_type,larvae_reported,report_count,first_reported_at,cleared_at,thumb_public_path,claimed,cleaned_by,after_thumb_path";
