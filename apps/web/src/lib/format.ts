const tag = (locale: string) => (locale === "bn" ? "bn-BD" : "en-GB");

export function formatNumber(n: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits }).format(n);
}

export function formatDate(d: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(typeof d === "string" ? new Date(d) : d);
}

export function hoursSince(d: string | Date, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(d).getTime()) / 3_600_000));
}
