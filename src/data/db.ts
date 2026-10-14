import Dexie, { type Table } from "dexie";
import type {
  CompositionUsage,
  Decision,
  Match,
  Review,
  ReviewDraft,
  TrainingGoal,
  TrainingSession,
} from "../domain/types";
import { summarizeCompositionUsage } from "../domain/composition/composition";

export interface AppSettings {
  /** Always the literal id `app` — a singleton record. */
  id: "app";
  /** Currently selected training session; `undefined` until bootstrapped. */
  activeSessionId?: string;
  updatedAt: string;
}

/**
 * Local-first persistence. Everything lives in IndexedDB in this browser;
 * `Export / Import` in the Data page is the only escape hatch, and it is
 * deliberately lossless so the player is never locked in.
 *
 * v2 (Phase 2.5) adds `trainingSessions` and `settings` (active session).
 * There is no real user history yet, so the bump is a plain additive
 * schema change — no migration logic.
 *
 * v4 (局外草稿) adds `reviewDrafts`, a table for 复盘 that are still being
 * written. It is additive like v2: an existing database keeps every row and
 * starts with an empty draft table, which is exactly right — nobody had
 * unfinished drafts before the feature existed.
 *
 * v3 (Phase 3A) adds `compositionUsage`, a derived per-composition counter
 * for Recent / Frequent / Preset composition picking. Existing v2 databases
 * keep every row; the upgrade backfills usage from the matches that are
 * already there (see the `upgrade` hook) so an upgrading player does not
 * start from an empty table.
 */
export class TftTrainingDatabase extends Dexie {
  matches!: Table<Match, string>;
  decisions!: Table<Decision, string>;
  reviews!: Table<Review, string>;
  trainingGoals!: Table<TrainingGoal, string>;
  trainingSessions!: Table<TrainingSession, string>;
  settings!: Table<AppSettings, "app">;
  compositionUsage!: Table<CompositionUsage, string>;
  /** Unfinished 复盘 answers; primary key is the match id (one draft per match). */
  reviewDrafts!: Table<ReviewDraft, string>;

  constructor(name = "tft-training-log") {
    super(name);
    this.version(1).stores({
      matches: "id, playedAt, placement, composition, reviewed, primaryMistake",
      decisions: "id, matchId, type",
      // `&matchId` keeps one review per match enforced by the database.
      reviews: "id, &matchId, primaryMistake, updatedAt",
      trainingGoals: "id, status, startDate",
    });
    this.version(2).stores({
      trainingSessions: "id, type",
      settings: "&id",
    });
    this.version(3)
      .stores({
        // `compositionKey` is the primary key, so uniqueness comes for free;
        // the two extra indexes serve Frequent (`usageCount`) and Recent
        // (`lastUsedAt`) ordering later.
        compositionUsage: "compositionKey, usageCount, lastUsedAt",
      })
      .upgrade(async (tx) => {
        // Derived data only — existing matches are read, never rewritten.
        const matches = (await tx.table("matches").toArray()) as Pick<
          Match,
          "composition" | "playedAt"
        >[];
        const rows = summarizeCompositionUsage(matches);
        if (rows.length > 0) await tx.table("compositionUsage").bulkPut(rows);
      });
    this.version(4).stores({
      // `matchId` is the primary key, so "one draft per match" is enforced by
      // the database and the drafts page can order by recency.
      reviewDrafts: "matchId, updatedAt",
    });
  }
}

export const db = new TftTrainingDatabase();
