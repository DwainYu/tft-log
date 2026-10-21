import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSnapshot,
  decisionsToCsv,
  importSnapshot,
  matchesToCsv,
  parseSnapshot,
  wipeAll,
} from "./export-service";
import { addMatch } from "./match-service";
import { addDecision } from "./decision-service";
import { addGoal } from "./training-service";
import { saveReview } from "./review-service";
import { matchRepository } from "../data/repository/match-repository";
import { resetDatabase } from "../test/db-helper";
import { SNAPSHOT_SCHEMA_VERSION, type Match, type TrainingSession } from "../domain/types";

beforeEach(resetDatabase);

async function seedTwo() {
  const a = await addMatch({
    playedAt: "2026-02-05T13:20",
    placement: "1",
    composition: "Arcader, gold-rush",
    notes: '他说了"上6"',
  });
  const b = await addMatch({ playedAt: "2026-02-04T20:10", placement: "7", composition: "Rebel" });
  await addDecision(a.id, { round: "3-2", type: "LEVELING", decision: "上 6", reasoning: "保战斗力" });
  await saveReview(a.id, {
    primaryMistake: "ECONOMY",
    biggestMistake: "利息没吃满",
    bestDecision: "2-5 存钱",
    nextGameFocus: "吃满利息",
  });
  await addGoal({
    title: "控制 D 牌预算",
    startDate: "2026-02-01",
    status: "active",
    relatedMistakes: ["ROLLING"],
  });
  return { a, b };
}

describe("export", () => {
  it("builds a snapshot with all four tables", async () => {
    await seedTwo();
    const snap = await buildSnapshot();
    expect(snap.app).toBe("tft-training-log");
    expect(snap.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snap.matches).toHaveLength(2);
    expect(snap.decisions).toHaveLength(1);
    expect(snap.reviews).toHaveLength(1);
    expect(snap.trainingGoals).toHaveLength(1);
  });

  it("renders CSV with proper escaping", async () => {
    const { a } = await seedTwo();
    const csv = matchesToCsv(await matchRepository.all());
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "id,played_at,placement,composition,final_level,final_health,duration_seconds,primary_mistake,reviewed,opening_plan,encounter_id,notes,session_id",
    );
    const rowA = lines.find((l) => l.includes(a.id))!;
    // commas inside composition and quotes inside notes must be escaped
    expect(rowA).toContain(`"Arcader, gold-rush"`);
    expect(rowA).toContain(`"他说了""上6"""`);
    expect(lines).toHaveLength(3); // header + 2 matches

    const { allDecisions } = await import("./decision-service");
    const dcsv = decisionsToCsv(await allDecisions());
    expect(dcsv.split("\n")).toHaveLength(2);
    expect(dcsv.split("\n")[0]).toContain("matchId");
  });
});

describe("import", () => {
  it("round-trips a full snapshot without losing newer local data", async () => {
    const { a } = await seedTwo();
    const snap = await buildSnapshot();

    // local evolves after the snapshot
    await addMatch({ playedAt: "2026-02-06T13:00", placement: "2", composition: "Fortune" });
    const newer = await addMatch({ playedAt: "2026-02-07T13:00", placement: "3" });

    const report = await importSnapshot(snap);
    expect(report).toMatchObject({ matches: 2, decisions: 1, reviews: 1, trainingGoals: 1, skipped: 0 });

    const all = await matchRepository.all();
    expect(all).toHaveLength(4); // 2 from snapshot + 2 local
    expect(all.map((m: Match) => m.id)).toContain(newer.id);
    expect(all.map((m: Match) => m.id)).toContain(a.id);
  });

  it("skips orphan decisions/reviews and malformed rows", async () => {
    const snap = await buildSnapshot();
    snap.decisions.push({ id: "x", matchId: "ghost-match" } as never);
    snap.reviews.push({ id: "y", matchId: "ghost-match" } as never);
    snap.matches.push({ playedAt: "2026-02-09T21:00" } as never); // no id
    snap.matches.push(("not-a-record" as unknown) as never); // not even a record

    const report = await importSnapshot(snap);
    expect(report.skipped).toBe(4);
    const decisions = await import("./decision-service").then((m) => m.allDecisions());
    expect(decisions.filter((d) => d.matchId === "ghost-match")).toHaveLength(0);
  });

  it("keeps a record that has no placement — it is an unfinished game, not junk", async () => {
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "no-placement",
      playedAt: "2026-02-09T21:00",
      composition: "Arcader",
      reviewed: false,
      createdAt: "2026-02-09T21:00:00.000Z",
      updatedAt: "2026-02-09T21:00:00.000Z",
    } as unknown as Match);

    const report = await importSnapshot(snap);
    expect(report.matches).toBe(1);
    expect(report.skipped).toBe(0);

    const stored = await matchRepository.get("no-placement");
    expect(stored).toBeDefined();
    expect(stored?.placement).toBeUndefined();
    expect("placement" in (stored ?? {})).toBe(false);
    // the opening information the player already typed survives the round trip
    expect(stored?.composition).toBe("Arcader");
  });

  it("still rejects a placement of 0 or 9 on import", async () => {
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "zero-placement",
      playedAt: "2026-02-09T21:00",
      placement: 0,
      reviewed: false,
    } as unknown as Match);
    snap.matches.push({
      id: "nine-placement",
      playedAt: "2026-02-09T21:00",
      placement: 9,
      reviewed: false,
    } as unknown as Match);

    const report = await importSnapshot(snap);
    expect(report.matches).toBe(0);
    expect(report.skipped).toBe(2);
    expect(await matchRepository.get("zero-placement")).toBeUndefined();
    expect(await matchRepository.get("nine-placement")).toBeUndefined();
  });

  it("round-trips an unfinished match through export → import", async () => {
    const unfinished = await addMatch({ playedAt: "2026-02-05T13:20", composition: "Arcader" });
    expect(unfinished.placement).toBeUndefined();

    const snap = await buildSnapshot();
    await wipeAll();
    expect(await matchRepository.all()).toHaveLength(0);

    const report = await importSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(report.matches).toBe(1);
    expect(report.skipped).toBe(0);

    const [restored] = await matchRepository.all();
    expect(restored.id).toBe(unfinished.id);
    expect(restored.placement).toBeUndefined();
    expect("placement" in restored).toBe(false);
    expect(restored.composition).toBe("Arcader");
    expect(restored.playedAt).toBe("2026-02-05T13:20");
  });

  it("rejects foreign files", () => {
    expect(() => parseSnapshot("{ nope")).toThrow("不是合法的 JSON");
    expect(() => parseSnapshot(JSON.stringify({ app: "other-app", matches: [] }))).toThrow("app 标识");
    expect(() => parseSnapshot(JSON.stringify({ app: "tft-training-log", matches: [] }))).toThrow(
      "缺少 decisions 数组",
    );
  });
});

describe("import + structured opening plan", () => {
  const full = {
    primaryMistake: "ECONOMY" as const,
    biggestMistake: "利息没吃满",
    bestDecision: "2-5 存钱",
    nextGameFocus: "吃满利息",
  };

  it("round-trips the opening route through a snapshot", async () => {
    const a = await addMatch({ playedAt: "2026-02-05T13:20", placement: "1", composition: "Arcader" });
    await saveReview(a.id, full, "WIN_STREAK");

    const snap = await buildSnapshot();
    await wipeAll();
    await importSnapshot(JSON.parse(JSON.stringify(snap)));

    expect((await matchRepository.get(a.id))?.openingPlan).toBe("WIN_STREAK");
  });

  it("exports the opening route as one CSV column", async () => {
    const a = await addMatch({ playedAt: "2026-02-05T13:20", placement: "1", composition: "Arcader" });
    await saveReview(a.id, full, "FORCE");
    const row = matchesToCsv(await matchRepository.all())
      .split("\n")
      .find((l) => l.includes(a.id))!;
    expect(row.split(",")).toContain("FORCE");
  });

  it("drops an opening route the vocabulary does not know", async () => {
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "future-m1",
      playedAt: "2026-02-09T21:00",
      placement: 5,
      openingPlan: "SOMETHING_FROM_A_LATER_VERSION",
    } as unknown as Match);

    await importSnapshot(snap);
    const m = await matchRepository.get("future-m1");
    expect(m).toBeDefined();
    expect(m?.openingPlan).toBeUndefined();
  });

  it("imports a legacy snapshot that has no opening route at all", async () => {
    const a = await addMatch({ playedAt: "2026-02-05T13:20", placement: "3", composition: "Rebel" });
    const snap = await buildSnapshot();
    const legacy = JSON.parse(JSON.stringify(snap));
    for (const m of legacy.matches) delete m.openingPlan;

    await wipeAll();
    const report = await importSnapshot(legacy);
    expect(report.matches).toBe(1);
    expect((await matchRepository.get(a.id))?.openingPlan).toBeUndefined();
  });
});

describe("import + Set 18 static ids", () => {
  it("imports a match carrying valid S18 ids and keeps them", async () => {
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "linked-m1",
      playedAt: "2026-02-09T21:00",
      placement: 5,
      set: 18,
      traitIds: ["DA_18_Spellweaver"],
      coreUnitIds: ["DA_18_Azir"],
      coreItemIds: ["TFT_Item_ArchangelsStaff"],
      augmentIds: ["DA_18_BigGrabBag"],
    } as unknown as Match);
    const report = await importSnapshot(snap);
    expect(report.matches).toBe(1);
    expect(report.skipped).toBe(0);
    const m = await matchRepository.get("linked-m1");
    expect(m?.coreUnitIds).toEqual(["DA_18_Azir"]);
    expect(m?.traitIds).toEqual(["DA_18_Spellweaver"]);
  });

  it("skips matches whose ids cannot be resolved in the Set 18 snapshot", async () => {
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "linked-bad",
      playedAt: "2026-02-09T21:00",
      placement: 5,
      coreUnitIds: ["DA_18_NotACampion"],
    } as unknown as Match);
    snap.matches.push({
      id: "linked-wrong-set",
      playedAt: "2026-02-09T21:00",
      placement: 5,
      set: 19,
    } as unknown as Match);
    const report = await importSnapshot(snap);
    expect(report.skipped).toBe(2);
    expect(await matchRepository.get("linked-bad")).toBeUndefined();
  });
});


describe("import + sessions", () => {
  it("round-trips sessions and keeps sessionId on matches", async () => {
    const { ensureDefaultSessions, setActiveSession } = await import("./session-service");
    await ensureDefaultSessions();
    await setActiveSession("yunding-s18");
    await addMatch({ playedAt: "2026-10-14T13:00", placement: "3" });

    const snap = await buildSnapshot();
    expect(snap.trainingSessions.map((s) => s.id)).toEqual(["daily", "yunding-s18"]);
    expect(snap.matches[0].sessionId).toBe("yunding-s18");

    // wipe the local db, import the snapshot back: context restored
    await wipeAll();
    await importSnapshot(snap);
    const all = await matchRepository.all();
    expect(all[0].sessionId).toBe("yunding-s18");
    const sessions = await import("../data/repository/training-session-repository").then(
      ({ trainingSessionRepository }) => trainingSessionRepository.all(),
    );
    expect(sessions).toHaveLength(2);
  });

  it("defaults a missing sessionId to daily", async () => {
    const { ensureDefaultSessions } = await import("./session-service");
    await ensureDefaultSessions();
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "legacy-m",
      playedAt: "2026-02-01T13:00",
      placement: 5,
    } as unknown as Match);
    await importSnapshot(snap);
    expect((await matchRepository.get("legacy-m"))?.sessionId).toBe("daily");
  });

  it("normalizes an unknown sessionId to daily instead of skipping the match", async () => {
    const { ensureDefaultSessions } = await import("./session-service");
    await ensureDefaultSessions();
    const snap = await buildSnapshot();
    snap.matches.push({
      id: "ghost-session-m",
      playedAt: "2026-02-01T13:00",
      placement: 5,
      sessionId: "no-such-session",
    } as unknown as Match);
    const report = await importSnapshot(snap);
    expect(report.skipped).toBe(0);
    expect((await matchRepository.get("ghost-session-m"))?.sessionId).toBe("daily");
  });

  it("imports sessions traveling inside the same snapshot", async () => {
    const snap = await buildSnapshot();
    snap.trainingSessions.push({
      id: "cup-prep",
      type: "competition",
      name: "杯赛准备",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    snap.matches.push({
      id: "cup-m",
      playedAt: "2026-11-01T13:00",
      placement: 2,
      sessionId: "cup-prep",
    } as unknown as Match);
    const report = await importSnapshot(snap);
    expect(report.sessions).toBe(1);
    expect(report.skipped).toBe(0);
    expect((await matchRepository.get("cup-m"))?.sessionId).toBe("cup-prep");
  });

  it("skips malformed session rows", async () => {
    const snap = await buildSnapshot();
    snap.trainingSessions.push({ id: "bad", type: "yunding" } as unknown as TrainingSession);
    const report = await importSnapshot(snap);
    expect(report.sessions).toBe(0);
    expect(report.skipped).toBe(1);
  });
});
