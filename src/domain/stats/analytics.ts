import { isReviewComplete, type ReviewInput } from "../review/review";
import { avgPlacement, hasResult } from "../match/match";
import { TOP4_PLACEMENT, type MistakeType } from "../types";
import { UNCLASSIFIED, lastWindow, type MatchForStats } from "./stats";

/**
 * Zero-new-field analytics: every number here comes from data the model
 * already stores. Nothing in this file adds a field, and nothing mutates its
 * inputs — the aggregations are read-only views over matches and decisions.
 *
 * The shared shape for "one row of a grouping" is `GroupStat`: how many
 * distinct matches carry the value, and how those matches placed.
 */

/* ------------------------------------------------------------------ */
/* Shared shape                                                        */
/* ------------------------------------------------------------------ */

export interface GroupStat {
  key: string;
  /** Distinct matches — a match with several decisions of one type counts once. */
  matches: number;
  avgPlacement: number | null;
  top4Rate: number | null;
}

function groupStatOf(key: string, ms: MatchForStats[]): GroupStat {
  // 和 `overallStats` 同一条规则：赛果只数有名次的局。没名次的记录既不该
  // 进 Top4 分子，也不该进分母。
  const ranked = ms.filter(hasResult);
  return {
    key,
    matches: ranked.length,
    avgPlacement: avgPlacement(ranked.map((m) => m.placement)),
    top4Rate: ranked.length
      ? ranked.filter((m) => (m.placement ?? 9) <= TOP4_PLACEMENT).length / ranked.length
      : null,
  };
}

/** Rows sorted by volume, ties broken by key so the order is stable. */
function byVolume(rows: GroupStat[]): GroupStat[] {
  return rows.sort((a, b) => b.matches - a.matches || a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export interface FieldCoverage {
  total: number;
  marked: number;
  unmarked: number;
  /** `marked / total`, `null` when there is nothing to divide by. */
  rate: number | null;
}

/** How much of the history carries `openingPlan`. */
export function openingPlanCoverage(matches: MatchForStats[]): FieldCoverage {
  const marked = matches.filter((m) => m.openingPlan).length;
  return coverageOf(matches.length, marked);
}

function coverageOf(total: number, marked: number): FieldCoverage {
  return {
    total,
    marked,
    unmarked: total - marked,
    rate: total > 0 ? marked / total : null,
  };
}

export interface ReviewCoverage extends FieldCoverage {
  /**
   * Matches whose review passes `isReviewComplete`. In normal operation this
   * equals `reviewed` (the service mirrors it); a gap means imported or
   * hand-edited data disagrees with the rule.
   */
  complete: number;
  reviewedCompleteGap: number;
}

/**
 * `reviewed` (the Match flag that gates every statistic) and
 * `isReviewComplete` (the rule behind it) are counted separately on purpose:
 * they are the same thing only while the write path is the only writer.
 */
export function reviewCoverage(matches: MatchForStats[], reviews: ReviewForStats[]): ReviewCoverage {
  const reviewed = matches.filter((m) => m.reviewed).length;
  const byMatch = new Map(reviews.map((r) => [r.matchId, r]));
  const complete = matches.filter((m) => {
    const r = byMatch.get(m.id);
    return r ? isReviewComplete(r) : false;
  }).length;
  return {
    ...coverageOf(matches.length, reviewed),
    complete,
    reviewedCompleteGap: Math.abs(reviewed - complete),
  };
}

/** The slice of a review the completeness rule reads. */
export type ReviewForStats = { matchId: string } & Partial<ReviewInput>;

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export interface DecisionForStats {
  matchId: string;
  type?: string;
  hindsight?: string;
}

/**
 * One row per value of `pick`, over the matches that have at least one such
 * decision. A match with several decisions of the same value counts once, so
 * the row means "matches where I made this kind of call", not "number of
 * calls".
 *
 * Decisions whose match is not in the list (orphans) are dropped: a decision
 * without a placement cannot be ranked.
 */
function decisionStats(
  matches: MatchForStats[],
  decisions: DecisionForStats[],
  pick: (d: DecisionForStats) => string | undefined,
): GroupStat[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const groups = new Map<string, Map<string, MatchForStats>>();
  for (const d of decisions) {
    const key = pick(d);
    const match = byId.get(d.matchId);
    if (!key || !match) continue;
    const deduped = groups.get(key) ?? new Map<string, MatchForStats>();
    deduped.set(match.id, match);
    groups.set(key, deduped);
  }
  return byVolume([...groups.entries()].map(([key, ms]) => groupStatOf(key, [...ms.values()])));
}

/** "What kind of call do I make, and how do those games place?" */
export function decisionTypeStats(matches: MatchForStats[], decisions: DecisionForStats[]): GroupStat[] {
  return decisionStats(matches, decisions, (d) => d.type);
}

/**
 * "Do the calls I judge correct actually place better?" — orthogonal to the
 * type view: one match can hold a correct and a wrong call, so it can appear
 * in several rows.
 */
export function decisionHindsightStats(
  matches: MatchForStats[],
  decisions: DecisionForStats[],
): GroupStat[] {
  return decisionStats(matches, decisions, (d) => d.hindsight);
}

/* ------------------------------------------------------------------ */
/* Augments                                                            */
/* ------------------------------------------------------------------ */

/**
 * One row per augment id. A match carrying the same id twice still counts
 * once for it; unknown ids are kept as their raw id so the row stays visible
 * instead of silently disappearing.
 */
export function augmentStats(matches: MatchForStats[]): GroupStat[] {
  const groups = new Map<string, Map<string, MatchForStats>>();
  for (const m of matches) {
    for (const id of new Set(m.augmentIds ?? [])) {
      if (!id) continue;
      const deduped = groups.get(id) ?? new Map<string, MatchForStats>();
      deduped.set(m.id, m);
      groups.set(id, deduped);
    }
  }
  return byVolume([...groups.entries()].map(([key, ms]) => groupStatOf(key, [...ms.values()])));
}

/* ------------------------------------------------------------------ */
/* Mistake structure over time                                         */
/* ------------------------------------------------------------------ */

export interface MistakeWindowRow {
  key: MistakeType | typeof UNCLASSIFIED;
  /** Count inside the newest `window` games. */
  recent: number;
  /** Count inside the `window` games before those. */
  previous: number;
}

/**
 * "Is the mix of my main mistakes changing?" — counts only. Turning this into
 * a direction ("improving") needs more history than a training log accumulates
 * early, so the caller gates on a full 2 × window before showing it at all.
 */
export function mistakeWindowCounts(matches: MatchForStats[], window = 10): MistakeWindowRow[] {
  const newestFirst = lastWindow(matches, window * 2);
  const recent = newestFirst.slice(0, window);
  const previous = newestFirst.slice(window);
  const count = (ms: MatchForStats[]) => {
    const c = new Map<string, number>();
    for (const m of ms) {
      const key = m.primaryMistake ?? UNCLASSIFIED;
      c.set(key, (c.get(key) ?? 0) + 1);
    }
    return c;
  };
  const recentCounts = count(recent);
  const previousCounts = count(previous);
  const keys = new Set([...recentCounts.keys(), ...previousCounts.keys()]);
  return [...keys]
    .map((key) => ({
      key: key as MistakeWindowRow["key"],
      recent: recentCounts.get(key) ?? 0,
      previous: previousCounts.get(key) ?? 0,
    }))
    .sort((a, b) => b.recent + b.previous - (a.recent + a.previous) || a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------------ */
/* Numeric buckets                                                     */
/* ------------------------------------------------------------------ */

export interface ValueBucket {
  key: string;
  label: string;
  /** Inclusive lower bound; `undefined` = unbounded below. */
  min?: number;
  /** Exclusive upper bound; `undefined` = unbounded above. */
  max?: number;
}

export interface BucketStat extends GroupStat {
  label: string;
}

export interface BucketBreakdown {
  /** Matches that carry the value at all — the denominator the reader needs. */
  filled: number;
  total: number;
  rows: BucketStat[];
}

/**
 * Match counts, average placement and Top4 rate per value band. Buckets are
 * declared by the caller with their business meaning; a value outside every
 * band would be a bug in the declaration, so it is dropped rather than
 * invented into a row.
 */
export function bucketStats(
  matches: MatchForStats[],
  valueOf: (m: MatchForStats) => number | undefined,
  buckets: ValueBucket[],
): BucketBreakdown {
  const withValue = matches.filter((m) => {
    const v = valueOf(m);
    return v !== undefined && v !== null && Number.isFinite(v);
  });
  const rows = buckets.map((b) => {
    const ms = withValue.filter((m) => {
      const v = valueOf(m)!;
      return (b.min === undefined || v >= b.min) && (b.max === undefined || v < b.max);
    });
    return { ...groupStatOf(b.key, ms), label: b.label };
  });
  return { filled: withValue.length, total: matches.length, rows };
}
