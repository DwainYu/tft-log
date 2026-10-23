import { matchRepository } from "../data/repository/match-repository";
import { reviewRepository } from "../data/repository/review-repository";
import { decisionRepository } from "../data/repository/decision-repository";
import { augmentRepository } from "../data/tft/repositories";
import { mistakeLabel } from "../domain/labels";
import {
  augmentStats,
  bucketStats,
  decisionHindsightStats,
  decisionTypeStats,
  mistakeWindowCounts,
  openingPlanCoverage,
  reviewCoverage,
  type BucketBreakdown,
  type FieldCoverage,
  type GroupStat,
  type MistakeWindowRow,
  type ReviewCoverage,
} from "../domain/stats/analytics";
import {
  compareRecentWindows,
  compositionStats,
  mistakeCounts,
  mostCommonMistakes,
  openingPlanStats,
  overallStats,
  placementTrendSeries,
  recentWindowStats,
  timeSlotStats,
  trainingStreak,
  UNCLASSIFIED,
  type CompositionStat,
  type OpeningPlanStat,
  type OverallStats,
  type TimeSlotStat,
  type WindowComparison,
} from "../domain/stats/stats";
import type { MistakeType, Match } from "../domain/types";

import { hasResult } from "../domain/match/match";
import type { MatchForStats } from "../domain/stats/stats";

/**
 * Statistics are pure functions over the matches table; this service just
 * loads the data and hands the results to the pages. Keeping the math in
 * `domain/stats` means every number here is unit-testable without IndexedDB.
 *
 * Session scope: every function accepts an optional `sessionId`
 * ("current training context"). Omitting it means *all* sessions — the
 * statistics never close the data away from the player.
 */

/**
 * 统计只看有赛果的对局。
 *
 * 一条记录可以在开局时就建起来（`Match.placement` 缺席），之后逐步补齐。
 * 在补齐之前它不是赛果：让它进平均名次 / 前四率 / 吃鸡率 / 名次趋势，等于
 * 用一条「还没打完」的局去稀释真实成绩，而且趋势图上会多出一个没有名次的点。
 * 未完成的记录仍然在对局列表里，随时可以点开继续记。
 */
function withResult(matches: Match[]): MatchForStats[] {
  return matches.filter(hasResult);
}

async function scopedMatches(sessionId?: string): Promise<Match[]> {
  const all = await matchRepository.all();
  return sessionId ? all.filter((m) => m.sessionId === sessionId) : all;
}

/** Same scoping, but only games that already have a placement. */
async function finishedMatches(sessionId?: string): Promise<MatchForStats[]> {
  return withResult(await scopedMatches(sessionId));
}

export async function allOverall(sessionId?: string): Promise<OverallStats> {
  return overallStats(await finishedMatches(sessionId));
}

export async function allStreak(sessionId?: string): Promise<number> {
  return trainingStreak(await finishedMatches(sessionId));
}

/** Newest-`limit` games, oldest → newest, ready for a line chart. */
export async function trend(limit = 20, sessionId?: string) {
  return placementTrendSeries(await finishedMatches(sessionId), limit);
}

export async function recentWindow(window: number, sessionId?: string) {
  return recentWindowStats(await finishedMatches(sessionId), window);
}

/** Recent window vs. the one before it — the "am I improving?" number. */
export async function windowComparison(
  window = 10,
  sessionId?: string,
): Promise<WindowComparison> {
  return compareRecentWindows(await finishedMatches(sessionId), window);
}

export interface MistakeChartEntry {
  key: MistakeType | typeof UNCLASSIFIED;
  label: string;
  count: number;
}

export async function mistakeChart(sessionId?: string): Promise<MistakeChartEntry[]> {
  return mistakeCounts(await finishedMatches(sessionId))
    .filter((c) => c.type !== UNCLASSIFIED || c.count > 0)
    .map((c) => ({
      key: c.type,
      label: c.type === UNCLASSIFIED ? "未分类" : mistakeLabel(c.type),
      count: c.count,
    }));
}

export async function commonMistakes(limit = 3, sessionId?: string) {
  return mostCommonMistakes(await finishedMatches(sessionId), limit);
}

export async function compositionChart(sessionId?: string): Promise<CompositionStat[]> {
  return compositionStats(await finishedMatches(sessionId));
}

/** Structured opening route × placement. Empty until someone marks a route. */
export async function openingPlanChart(sessionId?: string): Promise<OpeningPlanStat[]> {
  return openingPlanStats(await finishedMatches(sessionId));
}

export async function timeSlotChart(sessionId?: string): Promise<TimeSlotStat[]> {
  return timeSlotStats(await finishedMatches(sessionId));
}

/* ------------------------------------------------------------------ */
/* Drill-down targets                                                  */
/* ------------------------------------------------------------------ */

/**
 * A chart point is only useful if it leads somewhere. These two build the
 * `/matches` query a chart row should link to, so every chart in the app
 * drills down into the same list with the same vocabulary.
 */

/**
 * `未分类` is not a mistake value — it means "no `primaryMistake` at all",
 * which `queryMatches` spells `none`. Sending `mistake=UNCLASSIFIED` would
 * match nothing, so this has to branch.
 */
export function mistakeDrillQuery(key: string): string {
  return key === UNCLASSIFIED ? "reviewed=unreviewed" : `mistake=${encodeURIComponent(key)}`;
}

/** Uses the normalized composition key; `queryMatches` normalizes both sides. */
export function compositionDrillQuery(key: string): string {
  return `composition=${encodeURIComponent(key)}`;
}

/* ------------------------------------------------------------------ */
/* Zero-new-field analytics                                            */
/* ------------------------------------------------------------------ */

/** How much of the history carries a structured opening route. */
export async function openingCoverageChart(sessionId?: string): Promise<FieldCoverage> {
  return openingPlanCoverage(await scopedMatches(sessionId));
}

/** `reviewed` flag vs. the rule behind it — a gap means the data disagrees. */
export async function reviewCoverageChart(sessionId?: string): Promise<ReviewCoverage> {
  const [matches, reviews] = await Promise.all([
    scopedMatches(sessionId),
    reviewRepository.all(),
  ]);
  return reviewCoverage(matches, reviews);
}

/** Decisions grouped by the kind of call, ranked by match placement. */
export async function decisionTypeChart(sessionId?: string): Promise<GroupStat[]> {
  const [matches, decisions] = await Promise.all([
    finishedMatches(sessionId),
    decisionRepository.all(),
  ]);
  return decisionTypeStats(matches, decisions);
}

/** Decisions grouped by the player's own hindsight verdict. */
export async function decisionHindsightChart(sessionId?: string): Promise<GroupStat[]> {
  const [matches, decisions] = await Promise.all([
    finishedMatches(sessionId),
    decisionRepository.all(),
  ]);
  return decisionHindsightStats(matches, decisions);
}

/**
 * Augments × placement. Names resolve against the bundled Set 18 snapshot;
 * an id the snapshot does not know keeps its raw id as the name, so an
 * unknown row stays visible instead of being silently dropped.
 */
export async function augmentChart(sessionId?: string): Promise<(GroupStat & { name: string })[]> {
  const matches = await finishedMatches(sessionId);
  return augmentStats(matches).map((row) => ({
    ...row,
    name: augmentRepository.getAugmentById(row.key)?.name ?? row.key,
  }));
}

/** Primary-mistake counts, newest window vs. the one before it. */
export async function mistakeTrendChart(
  window = 10,
  sessionId?: string,
): Promise<MistakeWindowRow[]> {
  return mistakeWindowCounts(await finishedMatches(sessionId), window);
}

/* ------------------------------------------------------------------ */
/* Numeric bands                                                       */
/* ------------------------------------------------------------------ */

export interface NumericBreakdown {
  health: BucketBreakdown;
  duration: BucketBreakdown;
  gold: BucketBreakdown;
}

/**
 * The bands carry their own rationale — they are heuristics, not measurements:
 *
 * - `finalHealth`: the game ends at 0, so ~30 is "one bad fight from death"
 *   and 60+ is a comfortable finish.
 * - `durationSeconds`: a standard TFT game runs roughly half an hour; shorter
 *   is a blowout either way, longer is a dragged-out endgame.
 * - `totalGold` (unspent): 10 gold is the interest step, so 0–9 means fully
 *   spent and 30+ means several interest tiers banked while losing.
 */
export const NUMERIC_BUCKETS = {
  health: [
    { key: "low", label: "低血量（0–29）", max: 30 },
    { key: "mid", label: "中血量（30–59）", min: 30, max: 60 },
    { key: "high", label: "高血量（60+）", min: 60 },
  ],
  duration: [
    { key: "short", label: "25 分钟内", max: 1500 },
    { key: "mid", label: "25–35 分钟", min: 1500, max: 2100 },
    { key: "long", label: "35 分钟以上", min: 2100 },
  ],
  gold: [
    { key: "spent", label: "基本花光（0–9）", max: 10 },
    { key: "some", label: "留有余钱（10–29）", min: 10, max: 30 },
    { key: "banked", label: "大量存钱（30+）", min: 30 },
  ],
} as const;

export async function numericBreakdownChart(sessionId?: string): Promise<NumericBreakdown> {
  const matches = await finishedMatches(sessionId);
  return {
    health: bucketStats(matches, (m) => m.finalHealth, [...NUMERIC_BUCKETS.health]),
    duration: bucketStats(matches, (m) => m.durationSeconds, [...NUMERIC_BUCKETS.duration]),
    gold: bucketStats(matches, (m) => m.totalGold, [...NUMERIC_BUCKETS.gold]),
  };
}
