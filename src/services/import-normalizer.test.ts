import { describe, expect, it } from "vitest";
import { prepareImportSnapshot } from "./import-normalizer";
import {
  DAILY_SESSION_ID,
  SNAPSHOT_SCHEMA_VERSION,
  type DatabaseSnapshot,
  type Match,
  type TrainingSession,
} from "../domain/types";

const NOW = "2026-11-06T08:00:00.000Z";

function snapshot(overrides: Partial<DatabaseSnapshot> = {}): DatabaseSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: "2026-11-06T08:00:00.000Z",
    app: "tft-training-log",
    matches: [],
    decisions: [],
    reviews: [],
    trainingGoals: [],
    trainingSessions: [],
    ...overrides,
  };
}

function session(id: string, overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id,
    type: "competition",
    name: `Session ${id}`,
    startDate: "2026-11-01",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function match(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    playedAt: "2026-11-01T13:00",
    placement: 3,
    reviewed: false,
    createdAt: "2026-11-01T13:00:00.000Z",
    updatedAt: "2026-11-01T13:00:00.000Z",
    ...overrides,
  };
}

describe("prepareImportSnapshot · Session references", () => {
  it("accepts a Session that already exists locally", () => {
    const prepared = prepareImportSnapshot(
      snapshot({ matches: [match("local-ref", { sessionId: "local-session" })] }),
      new Set(["local-session"]),
      () => NOW,
    );

    expect(prepared.matches[0].sessionId).toBe("local-session");
    expect(prepared.skipped).toBe(0);
  });

  it("accepts a valid Session introduced by the same snapshot", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        trainingSessions: [session("new-session")],
        matches: [match("new-ref", { sessionId: "new-session" })],
      }),
      [],
      () => NOW,
    );

    expect(prepared.sessions.map((s) => s.id)).toEqual(["new-session"]);
    expect(prepared.matches[0].sessionId).toBe("new-session");
    expect(prepared.skipped).toBe(0);
  });

  it("does not treat a malformed Session as a valid reference", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        trainingSessions: [
          { id: "bad-session", type: "future-type", name: "未来训练" } as unknown as TrainingSession,
        ],
        matches: [match("bad-ref", { sessionId: "bad-session" })],
      }),
      [],
      () => NOW,
    );

    expect(prepared.sessions).toEqual([]);
    expect(prepared.matches[0].sessionId).toBe(DAILY_SESSION_ID);
    expect(prepared.skipped).toBe(1);
  });

  it("normalizes missing, empty, and unknown Session ids to daily", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        matches: [
          match("missing"),
          match("empty", { sessionId: "" }),
          match("unknown", { sessionId: "does-not-exist" }),
        ],
      }),
      [],
      () => NOW,
    );

    expect(prepared.matches.map((m) => m.sessionId)).toEqual([
      DAILY_SESSION_ID,
      DAILY_SESSION_ID,
      DAILY_SESSION_ID,
    ]);
  });
});

describe("prepareImportSnapshot · normalization and filtering", () => {
  it("normalizes Session defaults while preserving explicit timestamps", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        trainingSessions: [
          {
            id: "defaulted",
            type: "competition",
            name: "  杯赛准备  ",
            startDate: "2026-11-01",
          } as unknown as TrainingSession,
          session("explicit", {
            active: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z",
          }),
        ],
      }),
      [],
      () => NOW,
    );

    expect(prepared.sessions[0]).toMatchObject({
      id: "defaulted",
      name: "杯赛准备",
      active: true,
      description: undefined,
      endDate: undefined,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(prepared.sessions[1]).toMatchObject({
      active: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("keeps a valid unfinished match", () => {
    const prepared = prepareImportSnapshot(
      snapshot({ matches: [match("unfinished", { placement: undefined })] }),
      [],
      () => NOW,
    );

    expect(prepared.matches).toHaveLength(1);
    expect(prepared.matches[0].placement).toBeUndefined();
    expect(prepared.skipped).toBe(0);
  });

  it("skips invalid placements, timestamps, and static ids", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        matches: [
          match("zero", { placement: 0 }),
          match("nine", { placement: 9 }),
          match("fraction", { placement: 2.5 }),
          match("bad-time", { playedAt: "not-a-date" }),
          match("bad-static", { coreUnitIds: ["DA_18_NotACampion"] }),
          match("kept"),
        ],
      }),
      [],
      () => NOW,
    );

    expect(prepared.matches.map((m) => m.id)).toEqual(["kept"]);
    expect(prepared.skipped).toBe(5);
  });

  it("keeps children only when their parent match survives", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        matches: [match("valid-parent")],
        decisions: [
          { id: "valid-decision", matchId: "valid-parent" },
          { id: "orphan-decision", matchId: "missing-parent" },
        ] as never,
        reviews: [
          { id: "valid-review", matchId: "valid-parent" },
          { id: "orphan-review", matchId: "missing-parent" },
        ] as never,
        trainingGoals: [
          { id: "valid-goal", title: "合法目标" },
          { id: "invalid-goal" },
        ] as never,
      }),
      [],
      () => NOW,
    );

    expect(prepared.decisions.map((d) => d.id)).toEqual(["valid-decision"]);
    expect(prepared.reviews.map((r) => r.id)).toEqual(["valid-review"]);
    expect(prepared.trainingGoals.map((g) => g.id)).toEqual(["valid-goal"]);
    expect(prepared.skipped).toBe(3);
  });

  it("drops unknown structured facts but keeps valid ones", () => {
    const prepared = prepareImportSnapshot(
      snapshot({
        matches: [
          match("valid-facts", {
            openingPlan: "ECONOMY",
            encounterId: "SET18_ENC_PRISMATIC_PARTY",
          }),
          match("unknown-facts", {
            openingPlan: "FROM_THE_FUTURE" as never,
            encounterId: "SET99_ENC_FROM_THE_FUTURE",
          }),
        ],
      }),
      [],
      () => NOW,
    );

    expect(prepared.matches[0].openingPlan).toBe("ECONOMY");
    expect(prepared.matches[0].encounterId).toBe("SET18_ENC_PRISMATIC_PARTY");
    expect(prepared.matches[1].openingPlan).toBeUndefined();
    expect(prepared.matches[1].encounterId).toBeUndefined();
  });

  it("does not mutate the input snapshot", () => {
    const input = snapshot({
      trainingSessions: [session("new-session")],
      matches: [
        match("keep", { sessionId: "new-session", openingPlan: "FROM_THE_FUTURE" as never }),
        match("drop", { playedAt: "bad-time" }),
      ],
    });
    const before = JSON.stringify(input);

    prepareImportSnapshot(input, [], () => NOW);

    expect(JSON.stringify(input)).toBe(before);
  });
});
