import { beforeEach, describe, expect, it } from "vitest";
import {
  addMatch,
  allMatches,
  deleteMatch,
  getMatch,
  getMatchBundle,
  knownCompositions,
  latestUnfinishedMatch,
  listMatches,
  quickAdd,
  recentMatches,
  saveMatchInput,
  trainedDateKeys,
  updateMatch,
} from "./match-service";
import { compositionUsageRepository } from "../data/repository/composition-usage-repository";
import { compositionSuggestions } from "./composition-usage-service";
import { addDecision } from "./decision-service";
import { saveReview } from "./review-service";
import { ValidationError } from "../lib/errors";
import { resetDatabase } from "../test/db-helper";
import { ensureDefaultSessions, setActiveSession } from "./session-service";
import type { ReviewInput } from "../domain/review/review";

const completeReview = (primaryMistake: "ECONOMY" | "ROLLING"): ReviewInput => ({
  primaryMistake,
  biggestMistake: primaryMistake === "ROLLING" ? "4-1 D 牌过深" : "利息没吃满",
  bestDecision: "3-2 直接上 6 保住了血量",
  nextGameFocus: "4-1 之后只 D 到 2 星主 C",
});

beforeEach(resetDatabase);

describe("match service CRUD", () => {
  it("creates a match from a manual payload", async () => {
    const created = await addMatch({
      playedAt: "2026-02-05T13:20",
      placement: "3",
      composition: "Arcader",
      coreUnits: "A / B / C",
      durationMinutes: "28",
    });

    expect(created.id).toBeTruthy();
    expect(created.placement).toBe(3);
    expect(created.durationSeconds).toBe(1680);
    expect(created.coreUnits).toEqual(["A", "B", "C"]);
    expect(created.reviewed).toBe(false);

    const stored = await getMatch(created.id);
    expect(stored).toEqual(created);
    expect(await allMatches()).toHaveLength(1);
  });

  it("rejects invalid payloads and stores nothing", async () => {
    await expect(addMatch({ playedAt: "2026-02-05T13:20", placement: "9" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(addMatch({ playedAt: "2026-02-05T13:20", placement: "0" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(addMatch({ playedAt: "昨天下午", placement: "3" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await allMatches()).toHaveLength(0);
  });

  it("saves a record with no placement — absent, never 0", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", composition: "Arcader" });
    expect(created.placement).toBeUndefined();
    expect("placement" in created).toBe(false);

    const stored = await getMatch(created.id);
    expect(stored?.placement).toBeUndefined();
    expect("placement" in (stored ?? {})).toBe(false);
    // the opening record is still there to be finished later
    expect(stored?.composition).toBe("Arcader");
  });

  it("defaults playedAt to now when the form leaves it blank", async () => {
    const created = await addMatch({ placement: "4" });
    expect(created.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("edits a match without changing its identity", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", placement: "6" });
    const updated = await updateMatch(created.id, {
      playedAt: created.playedAt,
      placement: "2",
      composition: "Fortune",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.placement).toBe(2);
    expect(updated.composition).toBe("Fortune");
    expect((await getMatch(created.id))?.placement).toBe(2);
  });

  it("deletes a match and cascades decisions + review", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", placement: "5" });
    await addDecision(created.id, {
      round: "3-2",
      type: "LEVELING",
      situation: "42 金币，72 血",
      decision: "直接上 6",
      reasoning: "保持战斗力",
    });
    await saveReview(created.id, completeReview("ECONOMY"));
    expect((await getMatchBundle(created.id))?.review).toBeTruthy();

    await deleteMatch(created.id);
    expect(await getMatchBundle(created.id)).toBeNull();
    expect(await allMatches()).toHaveLength(0);
  });

  it("prunes the composition usage row of the deleted match", async () => {
    const created = await addMatch({
      playedAt: "2026-02-05T13:20",
      placement: "5",
      composition: "已删除阵容",
    });
    expect(await compositionUsageRepository.get("已删除阵容")).toBeTruthy();

    await deleteMatch(created.id);

    expect(await compositionUsageRepository.get("已删除阵容")).toBeUndefined();
    // the selector reads only this table, so a gone match must stop suggesting it
    const sections = await compositionSuggestions();
    const offered = [...sections.recent, ...sections.frequent, ...sections.preset];
    expect(offered.map((c) => c.key)).not.toContain("已删除阵容");
  });

  it("keeps other compositions when only one match is deleted", async () => {
    const doomed = await addMatch({
      playedAt: "2026-02-05T13:20",
      placement: "3",
      composition: "要删的阵容",
    });
    const kept = await addMatch({
      playedAt: "2026-02-04T13:20",
      placement: "4",
      composition: "要留的阵容",
    });
    const alsoKept = await addMatch({
      playedAt: "2026-02-03T13:20",
      placement: "2",
      composition: "要留的阵容",
    });

    await deleteMatch(doomed.id);

    expect(await compositionUsageRepository.get("要删的阵容")).toBeUndefined();
    const keptRow = await compositionUsageRepository.get("要留的阵容");
    expect(keptRow?.usageCount).toBe(2);
    expect((await allMatches()).map((m) => m.id).sort()).toEqual(
      [kept.id, alsoKept.id].sort(),
    );
  });

  it("rebuilds idempotently and tolerates deleting an unknown id", async () => {
    const created = await addMatch({
      playedAt: "2026-02-05T13:20",
      placement: "3",
      composition: "幂等阵容",
    });
    const before = await compositionUsageRepository.get("幂等阵容");

    // deleting something that is not there must not disturb the existing rows
    await expect(deleteMatch("no-such-match-id")).resolves.toBeUndefined();
    expect(await compositionUsageRepository.get("幂等阵容")).toEqual(before);

    await deleteMatch(created.id);
    expect(await compositionUsageRepository.get("幂等阵容")).toBeUndefined();
    expect(await allMatches()).toHaveLength(0);
  });

  it("does not count an unfinished match's planned composition, and clears it on delete", async () => {
    // opened at the start of a game: placement is absent, composition is a plan
    const unfinished = await addMatch({
      playedAt: "2026-02-05T13:20",
      composition: "计划阵容",
    });
    const settled = await addMatch({
      playedAt: "2026-02-04T13:20",
      placement: "2",
      composition: "已结算阵容",
    });
    expect(await compositionUsageRepository.get("计划阵容")).toBeUndefined();

    await deleteMatch(unfinished.id);

    expect(await compositionUsageRepository.get("计划阵容")).toBeUndefined();
    // the unrelated row survives a delete that could not have touched it
    const settledRow = await compositionUsageRepository.get("已结算阵容");
    expect(settledRow).toBeTruthy();
    expect(settledRow?.usageCount).toBe(1);
    expect((await allMatches()).map((m) => m.id)).toEqual([settled.id]);
  });

  it("marks a match reviewed only when the review is complete", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", placement: "4" });
    await saveReview(created.id, completeReview("ROLLING"));
    const after = await getMatch(created.id);
    expect(after?.reviewed).toBe(true);
    // review's primary mistake becomes the single source of truth on the match
    expect(after?.primaryMistake).toBe("ROLLING");
  });

  it("queries and sorts through the service", async () => {
    await addMatch({ playedAt: "2026-02-05T13:20", placement: "1", composition: "Arcader" });
    await addMatch({ playedAt: "2026-02-04T20:10", placement: "7", composition: "Rebel" });
    await addMatch({ playedAt: "2026-02-03T18:00", placement: "2", composition: "Arcader" });

    const top4 = await listMatches({ placement: "top4" });
    expect(top4.map((m) => m.placement)).toEqual([1, 2]);

    const recent = await recentMatches(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].playedAt).toBe("2026-02-05T13:20");

    expect(await knownCompositions()).toEqual(["Arcader", "Rebel"]);
    expect(await trainedDateKeys()).toEqual(["2026-02-05", "2026-02-04", "2026-02-03"]);
  });
});

describe("match service + Set 18 static ids", () => {
  it("stores canonical ids that resolve in the snapshot", async () => {
    const m = await saveMatchInput({
      playedAt: "2026-02-08T20:00",
      placement: 3,
      set: 18,
      coreUnitIds: ["DA_18_Azir"],
      traitIds: ["DA_18_Executioner"],
    });
    expect(m.coreUnitIds).toEqual(["DA_18_Azir"]);
    expect(m.traitIds).toEqual(["DA_18_Executioner"]);
  });

  it("rejects a write whose ids the snapshot does not know", async () => {
    await expect(
      saveMatchInput({
        playedAt: "2026-02-08T20:00",
        placement: 3,
        coreUnitIds: ["DA_18_NotACampion"],
      }),
    ).rejects.toThrow(ValidationError);
    expect(await allMatches()).toHaveLength(0);
  });
});


describe("match + session integration", () => {
  it("new matches inherit the active session (default: daily)", async () => {
    await ensureDefaultSessions();
    const m = await addMatch({ playedAt: "2026-10-13T13:00", placement: "3" });
    expect(m.sessionId).toBe("daily");

    await setActiveSession("yunding-s18");
    const comp = await addMatch({ playedAt: "2026-10-14T13:00", placement: "5" });
    expect(comp.sessionId).toBe("yunding-s18");

    await setActiveSession("daily");
    const back = await addMatch({ playedAt: "2026-10-15T13:00", placement: "2" });
    expect(back.sessionId).toBe("daily");
  });

  it("an explicit sessionId in the payload wins over the active one", async () => {
    await ensureDefaultSessions();
    await setActiveSession("yunding-s18");
    const m = await addMatch({ playedAt: "2026-10-13T13:00", placement: "4", sessionId: "daily" });
    expect(m.sessionId).toBe("daily");
  });

  it("existing matches can be moved to another session", async () => {
    await ensureDefaultSessions();
    const m = await addMatch({ playedAt: "2026-10-13T13:00", placement: "6" });
    expect(m.sessionId).toBe("daily");
    const moved = await updateMatch(m.id, {
      playedAt: m.playedAt,
      placement: "6",
      sessionId: "yunding-s18",
    });
    expect(moved.sessionId).toBe("yunding-s18");
    expect((await getMatch(m.id))?.sessionId).toBe("yunding-s18");
  });

  it("Quick Add lands in the active session without a session field", async () => {
    await ensureDefaultSessions();
    await setActiveSession("yunding-s18");
    const m = await quickAdd({ placement: "2", composition: "Rebel" });
    expect(m.sessionId).toBe("yunding-s18");
  });
});

describe("unfinished matches (no placement)", () => {
  it("latestUnfinishedMatch returns the newest placement-less match", async () => {
    expect(await latestUnfinishedMatch()).toBeUndefined();

    const older = await addMatch({ playedAt: "2026-02-05T13:20", composition: "Arcader" });
    const newer = await addMatch({ playedAt: "2026-02-06T13:20", composition: "Rebel" });
    expect((await latestUnfinishedMatch())?.id).toBe(newer.id);

    // once the newer one is settled, the older opening record is the one left
    await updateMatch(newer.id, { playedAt: newer.playedAt, placement: "3" });
    expect((await latestUnfinishedMatch())?.id).toBe(older.id);

    await updateMatch(older.id, { playedAt: older.playedAt, placement: "5" });
    expect(await latestUnfinishedMatch()).toBeUndefined();
  });

  it("latestUnfinishedMatch ignores settled games", async () => {
    await addMatch({ playedAt: "2026-02-07T13:20", placement: "1" });
    await addMatch({ playedAt: "2026-02-08T13:20", placement: "8" });
    expect(await latestUnfinishedMatch()).toBeUndefined();
  });

  it("updateMatch clears the placement when the payload carries none", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", placement: "3" });
    expect(created.placement).toBe(3);

    const cleared = await updateMatch(created.id, { playedAt: created.playedAt, placement: "" });
    expect(cleared.placement).toBeUndefined();
    expect("placement" in cleared).toBe(false);
    expect((await getMatch(created.id))?.placement).toBeUndefined();
  });

  it("saveMatchInput without a placement keeps the existing one", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", placement: "6" });

    // The merge entry point: not mentioning `placement` means "unchanged",
    // which is how a result-only write from LCU / OCR will land later.
    const merged = await saveMatchInput({ playedAt: created.playedAt, composition: "Fortune" }, created.id);
    expect(merged.placement).toBe(6);
    expect(merged.composition).toBe("Fortune");
    expect((await getMatch(created.id))?.placement).toBe(6);
  });

  it("editing a settled match's composition rebuilds the usage table", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", placement: "3", composition: "法师" });
    expect((await compositionUsageRepository.get("法师"))?.usageCount).toBe(1);

    // 结算后又改阵容：法师要退掉，斗士要补上 —— updateMatch 不做增量计数，
    // 靠一次幂等重建补齐。
    await updateMatch(created.id, {
      playedAt: created.playedAt,
      placement: "3",
      composition: "斗士",
    });
    expect((await compositionUsageRepository.get("法师"))).toBeUndefined();
    expect((await compositionUsageRepository.get("斗士"))?.usageCount).toBe(1);
  });

  it("rebuilding usage never counts an unfinished record's planned composition", async () => {
    // 开局就建一条带 composition 的记录：它还没打完，不能算「用过」。
    const opening = await addMatch({ playedAt: "2026-02-05T13:20", composition: "法师" });
    expect(await compositionUsageRepository.get("法师")).toBeUndefined();

    // 任何重建（导入 / 迁移会触发同一条路径）也不能把它算进去
    const { rebuildCompositionUsage } = await import("./composition-usage-service");
    await rebuildCompositionUsage();
    expect(await compositionUsageRepository.get("法师")).toBeUndefined();

    // 结算补名次后，这次重建才把它计入
    await saveMatchInput({ playedAt: opening.playedAt, placement: 4 }, opening.id);
    expect((await compositionUsageRepository.get("法师"))?.usageCount).toBe(1);
  });

  it("saveMatchInput can settle a match that started without a result", async () => {
    const created = await addMatch({ playedAt: "2026-02-05T13:20", composition: "Arcader" });
    expect(created.placement).toBeUndefined();

    const settled = await saveMatchInput({ playedAt: created.playedAt, placement: 2 }, created.id);
    expect(settled.placement).toBe(2);
    expect(settled.composition).toBe("Arcader");
    expect((await getMatch(created.id))?.placement).toBe(2);
  });
});
