// Mirrors public.game_rules() in supabase/migrations/20261001000100_security_hardening.sql.
export const RULES = {
  report: 5,
  clean: 20,
  cleanOwn: 10,
  larvaeBonus: 10,
  overdueBonus: 10,
  claimHours: 3,
  confirmHours: 48,
  // Measured from the public (~50 m snapped) point, exactly as the server does.
  radiusM: 80,
} as const;

// Daily limits grow with confirmed XP (anti-abuse that also reads as progression).
export const TIERS = [
  { min: 0, claims: 1, cleans: 3 },
  { min: 50, claims: 2, cleans: 6 },
  { min: 150, claims: 3, cleans: 10 },
] as const;

export const LEVELS = [
  { key: "l1", min: 0 },
  { key: "l2", min: 50 },
  { key: "l3", min: 150 },
  { key: "l4", min: 400 },
  { key: "l5", min: 1000 },
  { key: "l6", min: 2500 },
] as const;
export type LevelKey = (typeof LEVELS)[number]["key"];

export function levelFor(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1]!.min) i++;
  const cur = LEVELS[i]!;
  const next = LEVELS[i + 1] ?? null;
  const progress = next ? (points - cur.min) / (next.min - cur.min) : 1;
  return { n: i + 1, key: cur.key, next, toNext: next ? next.min - points : 0, progress: Math.max(0, Math.min(1, progress)) };
}

export type RewardLine = { key: "rewardBase" | "rewardLarvae" | "rewardOverdue" | "rewardOwn"; points: number };

/** What cleaning this site is worth (same logic as complete_cleanup). */
export function rewardFor(site: { larvae: boolean; firstReportedAt: string | Date; reportedByMe?: boolean }, now = Date.now()) {
  if (site.reportedByMe) return { total: RULES.cleanOwn, lines: [{ key: "rewardOwn", points: RULES.cleanOwn }] as RewardLine[] };
  const lines: RewardLine[] = [{ key: "rewardBase", points: RULES.clean }];
  if (site.larvae) lines.push({ key: "rewardLarvae", points: RULES.larvaeBonus });
  if (now - new Date(site.firstReportedAt).getTime() > 72 * 3_600_000) lines.push({ key: "rewardOverdue", points: RULES.overdueBonus });
  return { total: lines.reduce((a, l) => a + l.points, 0), lines };
}

export const BADGES = [
  { key: "streak4", icon: "🔥", earned: (s: Stats) => (s.streakWeeks ?? 0) >= 4 },
  { key: "firstReport", icon: "📸", earned: (s: Stats) => s.reports >= 1 },
  { key: "firstClean", icon: "🪣", earned: (s: Stats) => s.cleans >= 1 },
  { key: "clean5", icon: "🌿", earned: (s: Stats) => s.cleans >= 5 },
  { key: "clean25", icon: "🏅", earned: (s: Stats) => s.cleans >= 25 },
  { key: "top10", icon: "🏆", earned: (s: Stats) => s.rankWeek !== null && s.rankWeek <= 10 && s.pointsWeek > 0 },
] as const;

export type Stats = { points: number; pointsWeek: number; cleans: number; reports: number; rankWeek: number | null; streakWeeks?: number };

/** Hunter names: 3–24 chars, no spaces or characters that break URLs/markup (same as the DB check). */
export function validHandle(h: string): boolean {
  const t = h.trim();
  return [...t].length >= 3 && [...t].length <= 24 && !/[\s<>"'/\\@]/.test(t);
}
