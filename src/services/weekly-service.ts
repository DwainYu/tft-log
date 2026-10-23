import { matchRepository } from "../data/repository/match-repository";
import { normalizeCompositionKey } from "../domain/composition/composition";
import { mistakeLabel } from "../domain/labels";
import { isGoalCurrent } from "../domain/training/training-goal";
import { allGoals } from "./training-service";
import {
  activeSummaryProvider,
  type ReviewSummary,
  type ReviewSummaryProvider,
  type WeeklySummaryInput,
} from "./review-summary";
import { UNCLASSIFIED } from "../domain/stats/stats";
import {
  endOfWeek,
  startOfWeek,
  addDays,
  dateKey,
  wallClockNow,
} from "../lib/wallclock";
import { hasResult } from "../domain/match/match";
import { formatDate } from "../lib/wallclock";

export interface WeeklyReport extends WeeklySummaryInput {
  summary: ReviewSummary;
  provider: string;
}

/** Games whose playedAt falls inside the week containing `anchor`. */
export async function weekStats(anchor = wallClockNow()): Promise<WeeklySummaryInput> {
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  const matches = (await matchRepository.all())
    .filter((m) => m.playedAt >= start.slice(0, 10) && m.playedAt <= end)
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  // 赛果统计只认有名次的局：没名次的记录（开局 / 进行中）算进「本周打了几局」，
  // 但不能进入平均名次和 Top4 分母，否则一个还没打完的局会把整周数据拉低。
  const ranked = matches.filter(hasResult);
  const rankedGames = ranked.length;

  const games = matches.length;
  const avg = rankedGames ? ranked.reduce((s, m) => s + (m.placement ?? 0), 0) / rankedGames : null;

  const mistakeCounts = new Map<string, number>();
  for (const m of matches) {
    const key = m.primaryMistake ?? UNCLASSIFIED;
    mistakeCounts.set(key, (mistakeCounts.get(key) ?? 0) + 1);
  }
  const mostCommonMistakes = [...mistakeCounts.entries()]
    .map(([type, count]) => ({
      type: type as WeeklySummaryInput["mostCommonMistakes"][number]["type"],
      label: type === UNCLASSIFIED ? "未分类" : mistakeLabel(type as never),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const compCounts = new Map<string, number>();
  const compPlacements = new Map<string, number[]>();
  for (const m of ranked) {
    const composition = normalizeCompositionKey(m.composition);
    if (!composition) continue;
    compCounts.set(composition, (compCounts.get(composition) ?? 0) + 1);
    compPlacements.set(composition, [...(compPlacements.get(composition) ?? []), m.placement ?? 0]);
  }
  let topComposition: WeeklySummaryInput["topComposition"] = null;
  for (const [composition, games_] of compCounts) {
    const list = compPlacements.get(composition) ?? [];
    const avgP = list.reduce((a, b) => a + b, 0) / list.length;
    if (!topComposition || games_ > topComposition.games) {
      topComposition = { composition, games: games_, avgPlacement: Math.round(avgP * 10) / 10 };
    }
  }

  const goals = (await allGoals()).filter((g) => isGoalCurrent(g));
  const currentGoal = goals[0] ?? null;

  return {
    weekStart: dateKey(start),
    weekEnd: dateKey(end),
    games,
    avgPlacement: avg !== null ? Math.round(avg * 10) / 10 : null,
    top4Rate: rankedGames ? ranked.filter((m) => (m.placement ?? 9) <= 4).length / rankedGames : null,
    wins: ranked.filter((m) => m.placement === 1).length,
    bottom4: ranked.filter((m) => (m.placement ?? 0) > 4).length,
    mostCommonMistakes,
    topComposition,
    currentGoal: currentGoal
      ? { id: currentGoal.id, title: currentGoal.title, description: currentGoal.description }
      : null,
  };
}

/** Week offset 0 = current week, -1 = previous week, … */
export async function weeklyReport(
  offset = 0,
  provider: ReviewSummaryProvider = activeSummaryProvider,
): Promise<WeeklyReport> {
  const anchor = addDays(wallClockNow(), offset * 7);
  const input = await weekStats(anchor);
  const summary = await provider.summarize(input);
  return { ...input, summary, provider: provider.key };
}

/** Human label for the report, e.g. "9/15 – 9/21（上周）" / "本周". */
export function weekRangeLabel(report: WeeklyReport, offset = 0): string {
  const range = `${formatDate(report.weekStart)} – ${formatDate(report.weekEnd)}`;
  if (offset === 0) return `${range}（本周）`;
  if (offset === -1) return `${range}（上周）`;
  return range;
}

/** A single, flat statement of the week — useful for export/agent tools. */
export function weeklyPlainText(report: WeeklyReport, offset = 0): string {
  const lines = [
    `周复盘 ${weekRangeLabel(report, offset)}`,
    report.games === 0 ? "本周没有记录对局。" : `场次 ${report.games} · 平均名次 ${report.avgPlacement} · Top4率 ${Math.round((report.top4Rate ?? 0) * 100)}% · 吃鸡 ${report.wins} · Bottom4 ${report.bottom4}`,
    ...report.summary.points,
  ];
  if (report.summary.nextStep) lines.push(`下一步：${report.summary.nextStep}`);
  return lines.join("\n");
}
