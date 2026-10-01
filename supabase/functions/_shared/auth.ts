// Service-only functions (notify-status, screen-report, weekly-digest, notify-support) are called
// by pg_cron with the key stored in Vault. Projects with the new API keys inject
// SUPABASE_SERVICE_ROLE_KEY in a form that need not equal the legacy service_role
// JWT the cron jobs send, so an exact match alone rejects them.
//
// These functions are deployed with verify_jwt = true: the gateway has already
// checked the JWT signature before the request reaches us. Under that guarantee
// it is safe to accept a token whose `role` claim is `service_role`. Never use
// this in a function deployed with --no-verify-jwt.

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function bearer(req: Request): string {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

export function isServiceToken(token: string, serviceKey: string | undefined): boolean {
  if (!token) return false;
  if (serviceKey && token === serviceKey) return true;
  return jwtRole(token) === "service_role";
}
