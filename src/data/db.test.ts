import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { TftTrainingDatabase } from "./db";
import type { Match } from "../domain/types";

/**
 * Phase 3A moves the schema to v3. A player upgrading from a Phase 2.5
 * database must keep every match and get usage rows backfilled for free, so
 * the migration is exercised against a real (fake-indexeddb) v2 database.
 */

const DB_NAME = "composition-usage-migration";
const V4_DB_NAME = "review-draft-migration";

const v2Match = (id: string, composition: string | undefined, playedAt: string): Match => ({
  id,
  playedAt,
  placement: 3,
  composition,
  reviewed: false,
  createdAt: "2026-02-01T05:00:00.000Z",
  updatedAt: "2026-02-01T05:00:00.000Z",
});

/** The schema as it shipped before v3, opened against a throwaway database. */
function openV2(): Dexie {
  const old = new Dexie(DB_NAME);
  old.version(1).stores({
    matches: "id, playedAt, placement, composition, reviewed, primaryMistake",
    decisions: "id, matchId, type",
    reviews: "id, &matchId, primaryMistake, updatedAt",
    trainingGoals: "id, status, startDate",
  });
  old.version(2).stores({
    trainingSessions: "id, type",
    settings: "&id",
  });
  return old;
}

async function seedV2(matches: Match[]): Promise<void> {
  const old = openV2();
  await old.table("matches").bulkPut(matches);
  await old.close();
}

describe("Dexie v2 -> v3 migration", () => {
  it("keeps every match and backfills composition usage", async () => {
    await Dexie.delete(DB_NAME);
    await seedV2([
      v2Match("old-1", "福牛", "2026-02-01T13:00"),
      v2Match("old-2", "福牛 ", "2026-02-02T13:00"),
      v2Match("old-3", "枪手", "2026-02-03T13:00"),
      v2Match("old-4", undefined, "2026-02-04T13:00"),
    ]);

    const upgraded = new TftTrainingDatabase(DB_NAME);
    await upgraded.open();
    try {
      const matches = await upgraded.matches.toArray();
      expect(matches).toHaveLength(4);
      // stored strings are left exactly as the player typed them
      expect(matches.find((m) => m.id === "old-2")?.composition).toBe("福牛 ");

      const rows = await upgraded.compositionUsage.toArray();
      expect(new Map(rows.map((r) => [r.compositionKey, r.usageCount]))).toEqual(
        new Map([
          ["福牛", 2],
          ["枪手", 1],
        ]),
      );
      const fortune = rows.find((r) => r.compositionKey === "福牛")!;
      expect(fortune.lastUsedAt > fortune.firstUsedAt).toBe(true);

      // indexes for Frequent / Recent ordering exist on the new table
      expect(upgraded.compositionUsage.schema.indexes.map((i) => i.name)).toEqual(
        expect.arrayContaining(["usageCount", "lastUsedAt"]),
      );
    } finally {
      await upgraded.delete();
    }
  });

  it("creates an empty usage table when there is no history yet", async () => {
    await Dexie.delete(DB_NAME);
    await seedV2([]);

    const upgraded = new TftTrainingDatabase(DB_NAME);
    await upgraded.open();
    try {
      expect(await upgraded.compositionUsage.count()).toBe(0);
      expect(await upgraded.matches.count()).toBe(0);
    } finally {
      await upgraded.delete();
    }
  });
});

/**
 * v4 adds `reviewDrafts` for the 草稿箱. Nothing has to be backfilled —
 * nobody had unfinished drafts before the feature existed — but every table
 * that existed in v3 has to survive untouched, and the new table must accept
 * one row per match.
 */
function openV3(): Dexie {
  const old = new Dexie(V4_DB_NAME);
  old.version(1).stores({
    matches: "id, playedAt, placement, composition, reviewed, primaryMistake",
    decisions: "id, matchId, type",
    reviews: "id, &matchId, primaryMistake, updatedAt",
    trainingGoals: "id, status, startDate",
  });
  old.version(2).stores({
    trainingSessions: "id, type",
    settings: "&id",
  });
  old.version(3).stores({
    compositionUsage: "compositionKey, usageCount, lastUsedAt",
  });
  return old;
}

describe("Dexie v3 -> v4 migration", () => {
  it("keeps every existing table and starts with an empty draft table", async () => {
    await Dexie.delete(V4_DB_NAME);
    const old = openV3();
    await old.table("matches").bulkPut([
      v2Match("m-1", "福牛", "2026-10-01T13:00"),
      v2Match("m-2", "枪手", "2026-10-02T13:00"),
    ]);
    await old.table("reviews").put({
      id: "r-1",
      matchId: "m-1",
      createdAt: "2026-10-01T13:00:00.000Z",
      updatedAt: "2026-10-01T13:00:00.000Z",
    });
    await old.close();

    const upgraded = new TftTrainingDatabase(V4_DB_NAME);
    await upgraded.open();
    try {
      expect(await upgraded.matches.count()).toBe(2);
      expect(await upgraded.reviews.count()).toBe(1);
      expect(await upgraded.reviewDrafts.count()).toBe(0);
      // one draft per match, enforced by the schema
      expect(upgraded.reviewDrafts.schema.primKey.name).toBe("matchId");
    } finally {
      await upgraded.delete();
    }
  });
});
