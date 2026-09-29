import { env } from "@/lib/env";
import { toCsv } from "@/lib/csv";

// Report-level anonymised export for researchers. The caller's own access
// token is forwarded, so the research_reports view's role check (RLS-style)
// decides; nothing privileged runs here.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return new Response("sign in as a researcher", { status: 401 });
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < 500_000; from += 1000) {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/research_reports?select=*&order=report_date`, {
      headers: { apikey: env.supabaseAnonKey, Authorization: auth, Range: `${from}-${from + 999}` },
      cache: "no-store",
    });
    if (!res.ok) return new Response("forbidden", { status: res.status === 401 ? 401 : 403 });
    const rows = (await res.json()) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  if (!out.length) return new Response("no data or not a researcher", { status: 403 });
  return new Response(toCsv(out), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="denguewatch-research-reports.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
