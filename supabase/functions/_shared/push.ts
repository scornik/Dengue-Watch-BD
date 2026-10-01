// Web push endpoint allow-list. Subscription endpoints come from browsers but
// are stored from user input, so only HTTPS URLs on known push services are
// ever contacted (no SSRF to arbitrary hosts). Mirrors the DB CHECK constraint
// on push_subscriptions.endpoint.

const EXACT_HOSTS = new Set(["fcm.googleapis.com", "web.push.apple.com"]);
const HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

/** Rejects with an Error("timeout") if `p` does not settle within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
