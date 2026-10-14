import type { ReviewInput } from "./review/review";

/**
 * Core domain types. Storage-agnostic: nothing here knows about Dexie or React.
 *
 * `ReviewInput` is imported from the review domain module; it is a type-only
 * import, so the cycle types.ts <-> review/review.ts costs nothing at runtime.
 *
 * Date convention
 * ---------------
 * `playedAt` / `startedAt` / `endedAt` are *local wall-clock* strings in the
 * shape `YYYY-MM-DDTHH:mm` (no timezone suffix). The tool targets the Chinese
 * TFT server, which lives in a single timezone, so wall-clock keeps sorting,
 * date filtering and time-of-day bucketing free of timezone arithmetic. `createdAt` / `updatedAt` are full ISO-8601 instants.
 */

export const MISTAKE_TYPES = [
  "ECONOMY",
  "LEVELING",
  "ROLLING",
  "COMPOSITION",
  "ITEM",
  "AUGMENT",
  "POSITIONING",
  "SCOUTING",
  "TEMPO",
  "TRANSITION",
  "OTHER",
] as const;

export type MistakeType = (typeof MISTAKE_TYPES)[number];

export const DECISION_TYPES = [
  "ECONOMY",
  "LEVELING",
  "ROLLING",
  "COMPOSITION",
  "ITEM",
  "AUGMENT",
  "POSITIONING",
  "STABILIZE",
  "WIN_STREAK",
  "LOSE_STREAK",
  "TRANSITION",
  "OTHER",
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

export const MAX_PLACEMENT = 8;
export const TOP4_PLACEMENT = 4;

/**
 * How the game was opened — the first structured 复盘 fact.
 *
 * It lives on `Match`, not on `Review`: the opening route is decided while
 * picking the composition, so it is a property of the game rather than of the
 * write-up. `Match` is also the only table the statistics read
 * (`stats-service.ts` → `scopedMatches`), so putting it here keeps one entry
 * point instead of two.
 *
 * Optional on purpose: `reviewed` is the availability gate for every
 * statistic, and adding a required field would silently shrink the dataset.
 */
export const OPENING_PLANS = [
  "WIN_STREAK",
  "LOSE_STREAK",
  "STANDARD",
  "ECONOMY",
  "FORCE",
] as const;

export type OpeningPlan = (typeof OPENING_PLANS)[number];

export interface Match {
  id: string;

  /** `YYYY-MM-DDTHH:mm` — when the game ended (used for sorting/filtering). */
  playedAt: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;

  /** 1 – 8 */
  placement: number;

  finalLevel?: number;
  finalHealth?: number;
  totalGold?: number;

  /** Free text in the MVP: composition name as the player writes it. */
  composition?: string;
  traits?: string[];
  coreUnits?: string[];
  coreItems?: string[];
  augments?: string[];

  /**
   * Canonical static-data identifiers (Set 18 snapshot, `data/tft/set18`).
   * Optional and purely additive: the free-text fields above stay the
   * source of record, old records simply have none of these.
   */
  set?: number;
  traitIds?: string[];
  coreUnitIds?: string[];
  coreItemIds?: string[];
  augmentIds?: string[];

  /**
   * Owning `TrainingSession`. New matches inherit the active session;
   * import / demo paths fill in `DAILY_SESSION_ID` so no match is ever an
   * orphan record without a session.
   */
  sessionId?: string;

  reviewed: boolean;
  primaryMistake?: MistakeType;
  notes?: string;

  /** Opening route; see `OPENING_PLANS`. Absent on every record logged before this field existed. */
  openingPlan?: OpeningPlan;

  /**
   * Opening encounter of this game — see `EncounterData` and the Set 18
   * catalog in `data/tft/set18/encounters.json`.
   *
   * A *separate dimension* from anything else on this record:
   *  - `augmentIds` is what the player *picked* (three choices at 2-1 / 3-2 / 4-2);
   *  - `encounterId` is what the game *rolled* before anyone picked anything,
   *    and it applies to everyone in the lobby;
   *  - augment tier combinations are derived information, never stored here.
   *
   * Three-way meaning of the value, which is why this is not a boolean:
   *  - absent  → nobody recorded it yet (every match logged before this field);
   *  - the catalog's `isNone` id → the game genuinely had no encounter;
   *  - any other id → that encounter happened.
   */
  encounterId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  matchId: string;

  /** e.g. `3-2`, `4-1`, `最终` */
  round: string;
  type: DecisionType;

  situation?: string;
  decision: string;
  reasoning?: string;
  result?: string;

  /** 现在回看是否正确 */
  hindsight?: DecisionHindsight;
  hindsightNote?: string;

  createdAt: string;
}

export const DECISION_HINDSIGHTS = ["correct", "wrong", "mixed"] as const;
export type DecisionHindsight = (typeof DECISION_HINDSIGHTS)[number];

/**
 * An unfinished 复盘 — what the player had typed when they walked away.
 *
 * Kept in its own table rather than written into `Review` for one reason: a
 * review row means "this match has been reviewed", and `match.reviewed` plus
 * every statistic derive from it. A half-typed conclusion must never be able
 * to look like the real thing, so it lives here until it is complete.
 *
 * One row per match (`matchId` is the primary key). Completing a 复盘 moves
 * the answers into `Review` and deletes the draft, so the two states are
 * mutually exclusive by construction.
 */
export interface ReviewDraft {
  matchId: string;
  input: ReviewInput;
  /** Alongside `input` because the form carries it too — see `Review.openingPlan`. */
  openingPlan?: OpeningPlan;
  /** Owning session, captured so the drafts page can show where it belongs. */
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  matchId: string;

  /** Three blocks, one text field each; the prompts live in REVIEW_SECTIONS. */
  opening?: string;
  midGame?: string;
  lateGame?: string;

  bestDecision?: string;
  biggestMistake?: string;
  primaryMistake?: MistakeType;
  nextGameFocus?: string;

  /** 1 – 5, self assessment of how well the game was played. */
  selfScore?: number;

  createdAt: string;
  updatedAt: string;
}

export const GOAL_STATUSES = ["active", "completed", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface TrainingGoal {
  id: string;

  title: string;
  description?: string;

  startDate: string;
  endDate?: string;

  relatedMistakes?: MistakeType[];
  status: GoalStatus;

  createdAt: string;
  updatedAt: string;
}

export const SESSION_TYPES = ["daily", "competition"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/**
 * How often a composition has been played, keyed by `normalizeCompositionKey()`.
 *
 * This is *derived* data — it can always be recomputed from `Match.composition`,
 * which is why it stays out of `DatabaseSnapshot` and is rebuilt after an
 * import instead of travelling inside the backup.
 *
 * Counts how many times the player logged the composition; `firstUsedAt` /
 * `lastUsedAt` are ISO instants derived from `Match.playedAt`.
 */
export interface CompositionUsage {
  compositionKey: string;
  usageCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
}

/** Stable id of the built-in daily training session. */
export const DAILY_SESSION_ID = "daily";

/**
 * A named training context: a period with its own goal and statistics.
 * `type` is a generic category ("daily" / "competition"); the concrete
 * event name ("云顶之巅冲榜 S18", a cup, S19 …) lives in `name` and can
 * be edited or replaced without touching the domain types.
 */
export interface TrainingSession {
  id: string;
  type: SessionType;
  name: string;
  description?: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, optional; must be >= startDate. */
  endDate?: string;
  /** Is this training context currently in progress? */
  active: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Everything the app persists as *recorded training data*, in one envelope —
 * used by JSON export/import. `compositionUsage` deliberately stays out: it is
 * derived from `matches` and rebuilt after an import.
 */
export interface DatabaseSnapshot {
  schemaVersion: number;
  exportedAt: string;
  app: "tft-training-log";
  matches: Match[];
  decisions: Decision[];
  reviews: Review[];
  trainingGoals: TrainingGoal[];
  trainingSessions: TrainingSession[];
  /**
   * Which slice of the database this file holds. Absent on every backup made
   * before Session-scoped export existed — those are full backups, so an
   * absent value means `all`. Optional so old files stay valid.
   */
  scope?: "all" | "competition" | "daily";
}

/**
 * Bumped only when the *shape* of a snapshot changes in a way an older build
 * cannot read. Phase 3A adds the derived `compositionUsage` table, which never
 * enters a snapshot, so the version stays at 2: old backups import unchanged
 * and rebuild their usage rows afterwards.
 */
export const SNAPSHOT_SCHEMA_VERSION = 2;
