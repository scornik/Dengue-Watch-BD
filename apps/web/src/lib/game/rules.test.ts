import { describe, expect, it } from "vitest";
import { BADGES, levelFor, rewardFor, validHandle } from "./rules";

describe("levels", () => {
  it("maps points to levels with progress to the next", () => {
    expect(levelFor(0)).toMatchObject({ n: 1, key: "l1", toNext: 50 });
    expect(levelFor(49).n).toBe(1);
    expect(levelFor(50)).toMatchObject({ n: 2, key: "l2", toNext: 100 });
    expect(levelFor(100).progress).toBeCloseTo(0.5);
    expect(levelFor(99999)).toMatchObject({ n: 6, next: null, toNext: 0, progress: 1 });
  });
});

describe("rewardFor", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  it("base only for a fresh site", () => {
    expect(rewardFor({ larvae: false, firstReportedAt: "2026-09-30T10:00:00Z" }, now).total).toBe(20);
  });
  it("adds larvae and overdue bonuses", () => {
    const r = rewardFor({ larvae: true, firstReportedAt: "2026-09-26T10:00:00Z" }, now);
    expect(r.total).toBe(40);
    expect(r.lines.map((l) => l.key)).toEqual(["rewardBase", "rewardLarvae", "rewardOverdue"]);
  });
  it("own report pays the flat own rate", () => {
    expect(rewardFor({ larvae: true, firstReportedAt: "2026-09-01", reportedByMe: true }, now).total).toBe(10);
  });
});

describe("badges and handles", () => {
  it("awards badges from stats", () => {
    const s = { points: 70, pointsWeek: 30, cleans: 5, reports: 2, rankWeek: 3, streakWeeks: 4 };
    expect(BADGES.filter((b) => b.earned(s)).map((b) => b.key)).toEqual(["streak4", "firstReport", "firstClean", "clean5", "top10"]);
  });
  it("validates hunter names like the database", () => {
    expect(validHandle("MoshaShikari")).toBe(true);
    expect(validHandle("মশা_শিকারি")).toBe(true);
    expect(validHandle("ab")).toBe(false);
    expect(validHandle("has space")).toBe(false);
    expect(validHandle("<script>")).toBe(false);
  });
});
