import { beforeEach, describe, expect, it } from "vitest";
import {
  buildScopedExport,
  buildSnapshot,
  importSnapshot,
  scopeSnapshot,
  type ExportScope,
} from "./export-service";
import { addMatch } from "./match-service";
import { addDecision } from "./decision-service";
import { saveReview } from "./review-service";
import { createSession, ensureDefaultSessions } from "./session-service";
import { matchRepository } from "../data/repository/match-repository";
import { resetDatabase } from "../test/db-helper";
import {
  SNAPSHOT_SCHEMA_VERSION,
  type DatabaseSnapshot,
  type Match,
  type TrainingSession,
} from "../domain/types";

// Session rows have to exist for a match to have a type at all — the app
// bootstraps them the same way on every real start.
beforeEach(async () => {
  await resetDatabase();
  await ensureDefaultSessions();
});

const DAILY: TrainingSession = {
  id: "daily",
  type: "daily",
  name: "日常训练",
  startDate: "2026-01-01",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const YUNDING: TrainingSession = {
  id: "yunding-s18",
  type: "competition",
  name: "云顶之巅冲榜 S18",
  startDate: "2026-10-13",
  endDate: "2026-10-18",
  active: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const match = (id: string, sessionId: string, extra: Partial<Match> = {}): Match => ({
  id,
  playedAt: "2026-10-14T12:00",
  placement: 3,
  reviewed: false,
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-14T12:00:00.000Z",
  sessionId,
  ...extra,
});

function snapshotOf(overrides: Partial<DatabaseSnapshot> = {}): DatabaseSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: "2026-10-14T12:00:00.000Z",
    app: "tft-training-log",
    matches: [],
    decisions: [],
    reviews: [],
    trainingGoals: [],
    trainingSessions: [DAILY, YUNDING],
    ...overrides,
  };
}

describe("Session-scoped export", () => {
  it("competition export excludes daily sessions and everything under them", async () => {
    const dailyGame = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", sessionId: "daily" });
    const compGame = await addMatch({ playedAt: "2026-10-14T13:00", placement: "5", sessionId: "yunding-s18" });
    const { snapshot } = await buildScopedExport("competition");

    const ids = snapshot.matches.map((m) => m.id);
    expect(ids).toContain(compGame.id);
    expect(ids).not.toContain(dailyGame.id);
    // The daily session row itself must not travel either.
    expect(snapshot.trainingSessions.map((s) => s.id)).toEqual(["yunding-s18"]);
  });

  it("daily export excludes competition sessions and everything under them", async () => {
    await createSession({ type: "competition", name: "云顶之巅冲榜 S18", startDate: "2026-10-13" });
    const dailyGame = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", sessionId: "daily" });
    const sessions = await buildSnapshot().then((s) => s.trainingSessions);
    const compId = sessions.find((s) => s.type === "competition")!.id;
    const compGame = await addMatch({ playedAt: "2026-10-14T13:00", placement: "5", sessionId: compId });

    const { snapshot } = await buildScopedExport("daily");
    const ids = snapshot.matches.map((m) => m.id);
    expect(ids).toContain(dailyGame.id);
    expect(ids).not.toContain(compGame.id);
    expect(snapshot.trainingSessions.some((s) => s.type === "competition")).toBe(false);
  });

  it("keeps a child record only when its parent match survives", () => {
    const snap = snapshotOf({
      matches: [match("m-daily", "daily"), match("m-comp", "yunding-s18")],
      decisions: [
        { id: "d1", matchId: "m-daily", round: "3-2", type: "LEVELING", decision: "上 6", createdAt: "x" },
        { id: "d2", matchId: "m-comp", round: "4-1", type: "ROLLING", decision: "D", createdAt: "x" },
      ],
      reviews: [
        { id: "r1", matchId: "m-daily", createdAt: "x", updatedAt: "x" },
        { id: "r2", matchId: "m-comp", createdAt: "x", updatedAt: "x" },
      ],
    });

    const competition = scopeSnapshot(snap, "competition");
    expect(competition.decisions.map((d) => d.id)).toEqual(["d2"]);
    expect(competition.reviews.map((r) => r.id)).toEqual(["r2"]);

    const daily = scopeSnapshot(snap, "daily");
    expect(daily.decisions.map((d) => d.id)).toEqual(["d1"]);
    expect(daily.reviews.map((r) => r.id)).toEqual(["r1"]);
  });

  it("full backup is untouched by scoping", async () => {
    await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", sessionId: "daily" });
    await addMatch({ playedAt: "2026-10-14T13:00", placement: "5", sessionId: "yunding-s18" });
    const full = await buildSnapshot("all");
    expect(full.matches).toHaveLength(2);
    expect(full.trainingSessions).toHaveLength(2);
    // an old caller must get the same thing as before scoping existed
    const legacyCall = await buildSnapshot();
    expect(legacyCall.matches).toEqual(full.matches);
    expect(legacyCall.trainingSessions).toEqual(full.trainingSessions);
    expect(legacyCall.scope).toBeUndefined();
  });

  it("preserves matches whose session cannot be resolved, and reports them", () => {
    const snap = snapshotOf({
      matches: [match("orphan", "session-that-was-deleted"), match("no-session-ref", "")],
    });
    const daily = scopeSnapshot(snap, "daily");
    // Kept rather than dropped: import assigns exactly these to the daily session.
    expect(daily.matches.map((m) => m.id).sort()).toEqual(["no-session-ref", "orphan"]);
    const competition = scopeSnapshot(snap, "competition");
    expect(competition.matches).toHaveLength(0);
  });

  it("treats the built-in daily id as daily even if its roware missing", () => {
    const snap = snapshotOf({
      trainingSessions: [],
      matches: [match("m1", "daily")],
    });
    expect(scopeSnapshot(snap, "daily").matches.map((m) => m.id)).toEqual(["m1"]);
    expect(scopeSnapshot(snap, "competition").matches).toHaveLength(0);
  });

  it("round-trips a scoped file through import without losing classification", async () => {
    const dailyGame = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", sessionId: "daily" });
    const compGame = await addMatch({ playedAt: "2026-10-14T13:00", placement: "5", sessionId: "yunding-s18" });
    await addDecision(compGame.id, { round: "3-2", type: "LEVELING", decision: "上 6" });
    await saveReview(compGame.id, {
      primaryMistake: "ECONOMY",
      biggestMistake: "利息没吃满",
      bestDecision: "2-5 存钱",
      nextGameFocus: "吃满利息",
    });

    const { snapshot } = await buildScopedExport("competition");
    expect(snapshot.scope).toBe("competition");
    await resetDatabase();
    // importing into a database that only knows the built-in daily session
    await importSnapshot(snapshot);

    const sessions = await buildSnapshot().then((s) => s.trainingSessions);
    const yunding = sessions.find((s) => s.id === "yunding-s18");
    expect(yunding?.type).toBe("competition");

    const restored = await matchRepository.get(compGame.id);
    expect(restored?.sessionId).toBe("yunding-s18");
    // the daily game never travelled in this file
    expect(await matchRepository.get(dailyGame.id)).toBeUndefined();
  });

  it("re-importing the same scoped file twice does not duplicate records", async () => {
    const compGame = await addMatch({ playedAt: "2026-10-14T13:00", placement: "5", sessionId: "yunding-s18" });
    await addDecision(compGame.id, { round: "3-2", type: "LEVELING", decision: "上 6" });
    const { snapshot } = await buildScopedExport("competition");

    await resetDatabase();
    const first = await importSnapshot(snapshot);
    const second = await importSnapshot(snapshot);
    expect(first.matches).toBe(1);
    expect(second.matches).toBe(1);
    expect((await matchRepository.all())).toHaveLength(1);
  });

  it("counts what each scope actually contains", async () => {
    await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", sessionId: "daily" });
    await addMatch({ playedAt: "2026-10-14T13:00", placement: "5", sessionId: "yunding-s18" });

    const all = await buildScopedExport("all");
    const comp = await buildScopedExport("competition");
    const daily = await buildScopedExport("daily");

    expect(all.summary.matches).toBe(2);
    expect(comp.summary.matches).toBe(1);
    expect(daily.summary.matches).toBe(1);
    // together they cover everything in the backup, with no overlap
    expect(comp.summary.matches + daily.summary.matches).toBe(all.summary.matches);
  });
});

describe("ExportScope type", () => {
  it("covers exactly the three offered scopes", () => {
    const scopes: ExportScope[] = ["all", "competition", "daily"];
    expect(scopes).toHaveLength(3);
  });
});
