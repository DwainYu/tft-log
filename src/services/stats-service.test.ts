import { beforeEach, describe, expect, it } from "vitest";
import {
  allOverall,
  allStreak,
  compositionChart,
  mistakeChart,
  recentWindow,
  timeSlotChart,
  trend,
} from "./stats-service";
import { createSession, ensureDefaultSessions, setActiveSession } from "./session-service";
import { allMatches, saveMatchInput } from "./match-service";
import { resetDatabase } from "../test/db-helper";

beforeEach(resetDatabase);

/** 3 daily games (placements 2, 4, 8) + 2 competition games (placements 1, 5). */
async function seed() {
  await ensureDefaultSessions();
  for (const [placement, date] of [
    [2, "2026-10-14T13:00"],
    [4, "2026-10-15T13:00"],
    [8, "2026-10-16T13:00"],
  ] as const) {
    await saveMatchInput({ playedAt: date, placement, composition: "Arcader" });
  }
  await setActiveSession("yunding-s18");
  for (const [placement, date] of [
    [1, "2026-10-13T13:00"],
    [5, "2026-10-14T20:00"],
  ] as const) {
    await saveMatchInput({ playedAt: date, placement, composition: "Rebel" });
  }
}

describe("session-scoped statistics", () => {
  it("computes daily session stats from its own matches only", async () => {
    await seed();
    const s = await allOverall("daily");
    expect(s.games).toBe(3);
    expect(s.avgPlacement).toBe(4.67);
    expect(s.top4Rate).toBe(2 / 3);
    expect(s.wins).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.bottom4Rate).toBe(1 / 3);
  });

  it("computes competition session stats from its own matches only", async () => {
    await seed();
    const s = await allOverall("yunding-s18");
    expect(s.games).toBe(2);
    expect(s.avgPlacement).toBe(3);
    expect(s.top4Rate).toBe(0.5);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBe(0.5);
    expect(s.bottom4Rate).toBe(0.5);
  });

  it("computes all-sessions stats when no scope is passed", async () => {
    await seed();
    const s = await allOverall();
    expect(s.games).toBe(5);
    expect(s.avgPlacement).toBeCloseTo((2 + 4 + 8 + 1 + 5) / 5, 5);
    expect(s.top4Rate).toBe(0.6);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBe(0.2);
  });

  it("returns null rates and zero games for an empty session", async () => {
    await seed();
    const cup = await createSession({
      type: "competition",
      name: "杯赛准备",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      active: true,
    });
    const s = await allOverall(cup.id);
    expect(s.games).toBe(0);
    expect(s.avgPlacement).toBeNull();
    expect(s.top4Rate).toBeNull();
    expect(s.winRate).toBeNull();
    expect(s.bottom4Rate).toBeNull();
    expect((await trend(20, cup.id)).length).toBe(0);
    expect(await allStreak(cup.id)).toBe(0);
    expect((await compositionChart(cup.id)).length).toBe(0);
    expect((await timeSlotChart(cup.id)).length).toBe(0);
    expect((await mistakeChart(cup.id)).length).toBe(0);
    expect((await recentWindow(10, cup.id)).games).toBe(0);
  });

  it("ignores unfinished matches (no placement) everywhere", async () => {
    await ensureDefaultSessions();
    await saveMatchInput({ playedAt: "2026-10-14T13:00", placement: 2, composition: "Arcader" });
    await saveMatchInput({ playedAt: "2026-10-15T13:00", placement: 4, composition: "Arcader" });
    const before = await allOverall("daily");
    expect(before.games).toBe(2);
    expect(before.avgPlacement).toBe(3);
    expect(before.top4Rate).toBe(1);
    expect(before.winRate).toBe(0);
    expect(before.bottom4Rate).toBe(0);
    const trendBefore = await trend(20, "daily");
    expect(trendBefore).toHaveLength(2);

    // three opening records: no result yet, so no statistic may move
    await saveMatchInput({ playedAt: "2026-10-16T13:00", composition: "Rebel" });
    await saveMatchInput({ playedAt: "2026-10-17T13:00", composition: "Rebel" });
    await saveMatchInput({ playedAt: "2026-10-18T13:00", composition: "Rebel" });

    const after = await allOverall("daily");
    expect(after.games).toBe(2);
    expect(after.avgPlacement).toBe(3);
    expect(after.top4Rate).toBe(1);
    expect(after.winRate).toBe(0);
    expect(after.bottom4Rate).toBe(0);

    const trendAfter = await trend(20, "daily");
    expect(trendAfter).toHaveLength(2);
    expect(trendAfter.map((p) => p.id)).toEqual(trendBefore.map((p) => p.id));

    // and the unfinished games are still in the database, not dropped
    expect((await allMatches()).filter((m) => m.placement === undefined)).toHaveLength(3);
  });

  it("lets a match that started unfinished join the stats once it is settled", async () => {
    await ensureDefaultSessions();
    const opening = await saveMatchInput({ playedAt: "2026-10-14T13:00", composition: "Arcader" });
    expect((await allOverall("daily")).games).toBe(0);

    const settled = await saveMatchInput({ playedAt: opening.playedAt, placement: 1 }, opening.id);
    expect(settled.placement).toBe(1);
    const s = await allOverall("daily");
    expect(s.games).toBe(1);
    expect(s.avgPlacement).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBe(1);
    expect(await trend(20, "daily")).toHaveLength(1);

    // settling must not create a second record
    expect(await allMatches()).toHaveLength(1);
  });

  it("scopes streaks, windows and charts to the session", async () => {
    await seed();
    expect((await trend(20, "daily")).length).toBe(3);
    expect((await trend(20, "yunding-s18")).length).toBe(2);
    const last10 = await recentWindow(10, "yunding-s18");
    expect(last10.games).toBe(2);
    expect(last10.avgPlacement).toBe(3);
    // composition charts reflect the filtered set
    const comps = await compositionChart("yunding-s18");
    expect(comps.map((c) => c.composition)).toEqual(["Rebel"]);
    expect(comps[0].games).toBe(2);
  });
});
