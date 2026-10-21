import { avgPlacement, hasResult } from "../match/match";
import { normalizeCompositionKey } from "../composition/composition";
import { round } from "../../lib/utils";
import { dateKey, TIME_SLOTS, OUTSIDE_SLOT_KEY, slotKeyOf, wallClockNow } from "../../lib/wallclock";
import { TOP4_PLACEMENT, type MistakeType, type OpeningPlan } from "../types";

/** What the statistics engine needs — anything with these fields works, including test fixtures. */
export interface MatchForStats {
  id: string;
  playedAt: string;
  /** 可选：没有名次的记录是「开局 / 进行中」，不能参与赛果统计。 */
  placement?: number;
  composition?: string;
  primaryMistake?: MistakeType;
  reviewed?: boolean;
  openingPlan?: OpeningPlan;
  augmentIds?: string[];
  durationSeconds?: number;
  totalGold?: number;
  finalHealth?: number;
}

/* ------------------------------------------------------------------ */
/* Overall                                                             */
/* ------------------------------------------------------------------ */

export interface OverallStats {
  games: number;
  avgPlacement: number | null;
  top4Rate: number | null;
  winRate: number | null;
  bottom4Rate: number | null;
  wins: number;
  top4: number;
  bottom4: number;
  reviewedGames: number;
}

/**
 * 赛果统计只数有名次的局。没有名次的记录（开局 / 进行中）在这里被排掉，
 * 而不是靠 `?? 0` 之类的哨兵混进分母 —— 一条还没打完的局既不是前四也
 * 不是后四，把它算进分母只会把前四率、吃鸡率往下拖。
 *
 * 服务层（`stats-service.finishedMatches`）已经先过滤一次，这里再过滤一次
 * 是为了让这个纯函数单独被喂到未结算记录时也算对。
 */
export function overallStats(matches: MatchForStats[]): OverallStats {
  const ranked = matches.filter(hasResult);
  const games = ranked.length;
  const wins = ranked.filter((m) => m.placement === 1).length;
  const top4 = ranked.filter((m) => (m.placement ?? 9) <= 4).length;
  const bottom4 = ranked.filter((m) => (m.placement ?? 0) > 4).length;
  const reviewedGames = matches.filter((m) => m.reviewed).length;
  return {
    games,
    avgPlacement: avgPlacement(matches.map((m) => m.placement)),
    top4Rate: games ? top4 / games : null,
    winRate: games ? wins / games : null,
    bottom4Rate: games ? bottom4 / games : null,
    wins,
    top4,
    bottom4,
    reviewedGames,
  };
}

/** Newest-first slice: the last `window` games by playedAt. */
export function lastWindow(matches: MatchForStats[], window: number): MatchForStats[] {
  return [...matches]
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .slice(0, window);
}

export interface WindowStats {
  games: number;
  avgPlacement: number | null;
  top4Rate: number | null;
  /** Top4 games — the numerator the UI shows next to the rate. */
  top4: number;
}

export function recentWindowStats(
  matches: MatchForStats[],
  window: number,
): WindowStats {
  const slice = lastWindow(matches.filter(hasResult), window);
  const top4 = slice.filter((m) => (m.placement ?? 9) <= 4).length;
  return {
    games: slice.length,
    avgPlacement: avgPlacement(slice.map((m) => m.placement)),
    top4Rate: slice.length ? top4 / slice.length : null,
    top4,
  };
}

/** Placement per game, oldest → newest, for the trend line chart. */
/**
 * 没名次的记录一个点都不画：趋势图的 Y 轴是 1–8 的名次，一个 undefined
 * 要么把点画到轴外，要么让线段跨过去连错。宁可少一个点。
 */
export function placementTrendSeries(matches: MatchForStats[], limit = 20) {
  const slice = lastWindow(matches.filter(hasResult), limit).reverse();
  return slice.map((m, i) => ({
    index: i + 1,
    label: m.playedAt.slice(5, 10),
    /** Full wall-clock stamp, so a tooltip can name one exact game. */
    playedAt: m.playedAt,
    placement: m.placement,
    top4: ((m.placement ?? 9) <= 4 ? 1 : 0) as 0 | 1,
    /** Tooltip-only: the player's own label for this game's line. */
    composition: normalizeCompositionKey(m.composition) || undefined,
    /** Drill-down target: clicking a point opens this match. */
    id: m.id,
  }));
}

/* ------------------------------------------------------------------ */
/* Window comparison                                                   */
/* ------------------------------------------------------------------ */

export interface WindowStats {
  games: number;
  avgPlacement: number | null;
  top4Rate: number | null;
}

export interface WindowComparison {
  window: number;
  /** The newest `window` games. */
  recent: WindowStats;
  /** The `window` games before those. */
  previous: WindowStats;
  /**
   * `recent.avgPlacement - previous.avgPlacement`. Negative means the average
   * placement number went *down*, i.e. the player improved.
   *
   * `null` until both windows are full — a half-empty comparison window would
   * otherwise read as "no change", which is a different statement.
   */
  deltaAvg: number | null;
}

/** The `window` games sitting directly in front of the newest `window`. */
function previousWindow(matches: MatchForStats[], window: number): MatchForStats[] {
  return lastWindow(matches, window * 2).slice(window);
}

/**
 * "Am I getting better?" — the one question a single window can never answer.
 * Needs 2 × `window` games; with fewer, `deltaAvg` stays `null`.
 */
export function compareRecentWindows(
  matches: MatchForStats[],
  window = 10,
): WindowComparison {
  const recent = recentWindowStats(matches, window);
  const previous = recentWindowStats(previousWindow(matches, window), window);
  const full = recent.games === window && previous.games === window;
  const deltaAvg =
    full && recent.avgPlacement !== null && previous.avgPlacement !== null
      ? round(recent.avgPlacement - previous.avgPlacement, 1)
      : null;
  return { window, recent, previous, deltaAvg };
}

/* ------------------------------------------------------------------ */
/* Mistake counts                                                      */
/* ------------------------------------------------------------------ */

export const UNCLASSIFIED = "UNCLASSIFIED" as const;

export function mistakeCounts(matches: MatchForStats[]): {
  type: MistakeType | typeof UNCLASSIFIED;
  count: number;
}[] {
  const counts = new Map<string, number>();
  for (const m of matches) {
    const key = m.primaryMistake ?? UNCLASSIFIED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: { type: MistakeType | typeof UNCLASSIFIED; count: number }[] = [
    ...counts.entries(),
  ].map(([type, count]) => ({ type: type as MistakeType | typeof UNCLASSIFIED, count }));
  out.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return out;
}

export function mostCommonMistakes(matches: MatchForStats[], limit = 3) {
  return mistakeCounts(matches)
    .filter((e) => e.type !== UNCLASSIFIED && e.count > 0)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Compositions                                                        */
/* ------------------------------------------------------------------ */

export interface CompositionStat {
  composition: string;
  games: number;
  avgPlacement: number | null;
  top4Rate: number | null;
  lastPlayed: string;
}

export function compositionStats(matches: MatchForStats[]): CompositionStat[] {
  const groups = new Map<string, MatchForStats[]>();
  for (const m of matches) {
    const key = normalizeCompositionKey(m.composition);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  const out: CompositionStat[] = [...groups.entries()].map(([composition, ms]) => {
    // 一局一个阵容坑：没名次的记录既不计入 games，也不进 Top4 分母。
    const ranked = ms.filter(hasResult);
    return {
      composition,
      games: ranked.length,
      avgPlacement: avgPlacement(ranked.map((m) => m.placement)),
      top4Rate: ranked.length
        ? ranked.filter((m) => (m.placement ?? 0) <= TOP4_PLACEMENT).length / ranked.length
        : null,
      lastPlayed: ms.map((m) => m.playedAt).sort().pop() ?? "",
    };
  });
  out.sort((a, b) => b.games - a.games || a.composition.localeCompare(b.composition));
  return out;
}

/* ------------------------------------------------------------------ */
/* Opening plans                                                       */
/* ------------------------------------------------------------------ */

export interface OpeningPlanStat {
  plan: OpeningPlan;
  games: number;
  avgPlacement: number | null;
  top4Rate: number | null;
}

/**
 * "Should I open with a win streak?" — grouping by a closed vocabulary is the
 * only way to answer it, which is exactly why the opening route is captured as
 * an enum instead of prose.
 *
 * Games without a plan are left out rather than shown as an "未填" row: an
 * unlabelled bucket says nothing about the labelled ones. Coverage is the
 * caller's job to display.
 */
export function openingPlanStats(matches: MatchForStats[]): OpeningPlanStat[] {
  const groups = new Map<OpeningPlan, MatchForStats[]>();
  for (const m of matches) {
    if (!m.openingPlan) continue;
    const list = groups.get(m.openingPlan) ?? [];
    list.push(m);
    groups.set(m.openingPlan, list);
  }
  return [...groups.entries()]
    .map(([plan, ms]) => {
      const ranked = ms.filter(hasResult);
      return {
        plan,
        games: ranked.length,
        avgPlacement: avgPlacement(ranked.map((m) => m.placement)),
        top4Rate: ranked.length
          ? ranked.filter((m) => (m.placement ?? 0) <= TOP4_PLACEMENT).length / ranked.length
          : null,
      };
    })
    .sort((a, b) => b.games - a.games || a.plan.localeCompare(b.plan));
}

/* ------------------------------------------------------------------ */
/* Time slots (2h buckets across the whole day)                        */
/* ------------------------------------------------------------------ */

export interface TimeSlotStat {
  key: string;
  label: string;
  games: number;
  avgPlacement: number | null;
  top4Rate: number | null;
}

export function timeSlotStats(matches: MatchForStats[]): TimeSlotStat[] {
  const groups = new Map<string, MatchForStats[]>();
  for (const m of matches) {
    const key = slotKeyOf(m.playedAt);
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  const order = [...TIME_SLOTS.map((s) => s.key), OUTSIDE_SLOT_KEY];
  return order
    .filter((key) => groups.has(key))
    .map((key) => {
      const ms = groups.get(key)!;
      const label =
        key === OUTSIDE_SLOT_KEY
          ? "未填时间"
          : TIME_SLOTS.find((s) => s.key === key)?.label ?? key;
      const ranked = ms.filter(hasResult);
      return {
        key,
        label,
        games: ranked.length,
        avgPlacement: avgPlacement(ranked.map((m) => m.placement)),
        top4Rate: ranked.length
          ? ranked.filter((m) => (m.placement ?? 0) <= TOP4_PLACEMENT).length / ranked.length
          : null,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Streak                                                              */
/* ------------------------------------------------------------------ */

/**
 * Consecutive training days, counting back from today. If today has no
 * game yet, the streak starts from yesterday — an evening player should
 * not lose the streak just because it is 09:00.
 */
export function trainingStreak(matches: MatchForStats[], today = dateKey(wallClockNow())): number {
  const days = new Set(matches.map((m) => dateKey(m.playedAt)));
  if (days.size === 0) return 0;
  const cursor = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  let probe = cursor;
  while (days.has(probe)) {
    streak += 1;
    probe = shiftDay(probe, -1);
  }
  return streak;
}

function shiftDay(dateKeyStr: string, days: number): string {
  const d = new Date(`${dateKeyStr}T12:00`);
  d.setDate(d.getDate() + days);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatRate(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${round(value * 100, digits)}%`;
}
