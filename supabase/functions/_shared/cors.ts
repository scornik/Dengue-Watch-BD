// CORS for browser calls. ALLOWED_ORIGINS is a comma-separated list; "*" allows all.
export function corsHeaders(req: Request, allowed = Deno.env.get("ALLOWED_ORIGINS") ?? "*"): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const allow = list.includes("*") ? "*" : list.includes(origin) ? origin : list[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    Vary: "Origin",
  };
}

export function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
