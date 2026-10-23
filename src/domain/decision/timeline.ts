import type { MistakeType } from "../types";
import { parseRound } from "./round";

/**
 * Timeline view model: existing facts about one match, ordered the way the
 * game unfolded. Nothing here is inferred — no economy curves, no health over
 * time, no stage grouping the data does not carry. A match has exactly two
 * kinds of real events:
 *
 * - `decision`: one row per `Decision`, in `round` order
 * - `outcome`: the final result, which is a *result*, never a mid-game state
 */

export interface DecisionEvent {
  kind: "decision";
  id: string;
  /** Raw string exactly as typed; unparseable values display verbatim. */
  round: string;
  /** Numeric order for `stage-index` rounds; `null` = unparseable, sorted last. */
  sortKey: number | null;
  /** Raw `Decision.type`; the UI maps it through `decisionLabel`. */
  type: string;
  /** What the player actually did. */
  title: string;
  hindsight?: "correct" | "wrong" | "mixed";
  /** Creation time — the stable tie-break for identical rounds. */
  createdAt: string;
}

export interface OutcomeEvent {
  kind: "outcome";
  id: "outcome";
  placement: number;
  /** Final values only — never presented as an in-game moment. */
  finalHealth?: number;
  primaryMistake?: MistakeType;
}

export type TimelineEvent = DecisionEvent | OutcomeEvent;

/** The slice of a Decision the timeline reads. */
export type DecisionForTimeline = Pick<
  Decision,
  "id" | "round" | "type" | "decision" | "hindsight" | "createdAt"
>;

type Decision = {
  id: string;
  round: string;
  type: string;
  decision: string;
  hindsight?: DecisionEvent["hindsight"];
  createdAt: string;
};

/** The slice of a Match the timeline reads. */
export type MatchForTimeline = Pick<Match, "placement" | "finalHealth" | "primaryMistake">;

type Match = {
  /** 可选：还没结算的对局（开局 / 进行中）没有结果，时间线也就没有 outcome 行。 */
  placement?: number;
  finalHealth?: number;
  primaryMistake?: MistakeType;
};

function roundOrderOf(round: string): number | null {
  const key = parseRound(round);
  return key ? key.stage * 100 + key.index : null;
}

/**
 * Decisions ordered by round (parseable ascending, free text last, ties by
 * creation time), then the outcome. Read-only over its inputs.
 */
export function buildTimeline(
  match: MatchForTimeline,
  decisions: DecisionForTimeline[],
): TimelineEvent[] {
  const events: DecisionEvent[] = decisions
    .map((d) => ({
      kind: "decision" as const,
      id: d.id,
      round: d.round,
      sortKey: roundOrderOf(d.round),
      type: d.type,
      title: d.decision,
      hindsight: d.hindsight,
      createdAt: d.createdAt,
    }))
    .sort(
      (a, b) =>
        (a.sortKey ?? Number.MAX_SAFE_INTEGER) - (b.sortKey ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    );
  // 没名次的对局只展示已经记下的回合决策：outcome 行是赛果，编不出来。
  if (match.placement === undefined) return events;
  return [
    ...events,
    {
      kind: "outcome" as const,
      id: "outcome",
      placement: match.placement,
      finalHealth: match.finalHealth,
      primaryMistake: match.primaryMistake,
    },
  ];
}
