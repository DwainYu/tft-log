import { formatDateTime, toDate } from "../../lib/wallclock";
import { normalizeCompositionKey } from "../composition/composition";
import { isBottom4, isTop4, isWin, type MatchForQuery } from "./match";

export type PlacementFilter = "all" | "top4" | "bottom4" | "win";
export type ReviewedFilter = "all" | "reviewed" | "unreviewed";
export type MistakeFilter = "all" | "none" | string;
export type SortField = "playedAt" | "placement" | "duration" | "composition";
export type SortDir = "asc" | "desc";

export interface MatchQuery {
  search?: string;
  placement?: PlacementFilter;
  reviewed?: ReviewedFilter;
  composition?: string;
  mistake?: MistakeFilter;
  /** `YYYY-MM-DD`, inclusive */
  from?: string;
  to?: string;
  /** Limit to one training session; omit for all sessions. */
  sessionId?: string;
  /**
   * Limit to one opening encounter. Two reserved values keep the three-way
   * meaning of `Match.encounterId` reachable from a filter:
   *  - `"all"` → no filtering
   *  - `"none"` → matches with no encounter recorded at all
   *  - an encounter id → matches with that encounter (incl. the "no encounter" one)
   */
  encounterId?: "all" | "none" | string;
  sortField?: SortField;
  sortDir?: SortDir;
  limit?: number;
}

export const DEFAULT_MATCH_QUERY: Required<Pick<MatchQuery, "sortField" | "sortDir">> = {
  sortField: "playedAt",
  sortDir: "desc",
};

/** Pure, DB-free filter/sort so the Matches page behaviour is unit-testable. */
export function queryMatches<T extends MatchForQuery>(matches: readonly T[], q: MatchQuery): T[] {
  const search = q.search?.trim().toLowerCase();
  const from = q.from ? toDate(`${q.from}T00:00`) : null;
  const to = q.to ? toDate(`${q.to}T23:59`) : null;

  const filtered = matches.filter((m) => {
    if (q.sessionId && m.sessionId !== q.sessionId) return false;
    if (q.placement && q.placement !== "all") {
      if (q.placement === "top4" && !isTop4(m)) return false;
      if (q.placement === "bottom4" && !isBottom4(m)) return false;
      if (q.placement === "win" && !isWin(m)) return false;
    }
    if (q.reviewed === "reviewed" && !m.reviewed) return false;
    if (q.reviewed === "unreviewed" && m.reviewed) return false;
    if (
      q.composition &&
      q.composition !== "all" &&
      normalizeCompositionKey(m.composition) !== normalizeCompositionKey(q.composition)
    )
      return false;

    if (q.mistake && q.mistake !== "all") {
      if (q.mistake === "none") {
        if (m.primaryMistake) return false;
      } else if (m.primaryMistake !== q.mistake) return false;
    }

    if (q.encounterId && q.encounterId !== "all") {
      if (q.encounterId === "none") {
        if (m.encounterId) return false;
      } else if (m.encounterId !== q.encounterId) return false;
    }

    const at = toDate(m.playedAt);
    if (at) {
      if (from && at < from) return false;
      if (to && at > to) return false;
    }

    if (search) {
      if (!matchSearchText(m, search)) return false;
    }
    return true;
  });

  const field = q.sortField ?? DEFAULT_MATCH_QUERY.sortField;
  const dir = q.sortDir ?? DEFAULT_MATCH_QUERY.sortDir;
  const sorted = [...filtered].sort((a, b) => compareMatches(a, b, field));
  if (field === "placement") {
    // 按名次排序时，没名次的记录（开局 / 进行中）永远垫底，且它们之间
    // 恒定按时间新→旧 —— 不能跟着 `dir` 一起被反转，否则 desc 时会翻到最前。
    const done = sorted.filter((m) => m.placement !== undefined);
    const open = sorted
      .filter((m) => m.placement === undefined)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    if (dir === "desc") done.reverse();
    return [...done, ...open];
  }
  return dir === "desc" ? sorted.reverse() : sorted;
}

function compareMatches(a: MatchForQuery, b: MatchForQuery, field: SortField): number {
  switch (field) {
    case "placement": {
      // 没有名次的记录（开局 / 进行中）永远排在最后，且 `dir` 反转时不能
      // 被翻到最前 —— 直接相减会得到 NaN，排序结果就变成未定义行为。
      if (a.placement === undefined && b.placement === undefined) {
        return a.playedAt.localeCompare(b.playedAt);
      }
      if (a.placement === undefined) return 1;
      if (b.placement === undefined) return -1;
      return a.placement - b.placement || a.playedAt.localeCompare(b.playedAt);
    }
    case "duration":
      return (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0);
    case "composition":
      return (a.composition ?? "zzz").localeCompare(b.composition ?? "zzz");
    case "playedAt":
    default:
      return a.playedAt.localeCompare(b.playedAt);
  }
}

const SEARCHABLE = (m: MatchForQuery): string[] => [
  m.composition ?? "",
  ...(m.traits ?? []),
  ...(m.coreUnits ?? []),
  ...(m.coreItems ?? []),
  ...(m.augments ?? []),
  m.notes ?? "",
  m.primaryMistake ?? "",
  // 没名次就没有可搜的文本，写成 "undefined" 会让搜索命中一堆无关记录。
  m.placement === undefined ? "" : String(m.placement),
  formatDateTime(m.playedAt),
];

function matchSearchText(m: MatchForQuery, search: string): boolean {
  return SEARCHABLE(m).some((text) => text.toLowerCase().includes(search));
}

export const EMPTY_MATCH_QUERY: MatchQuery = {
  search: "",
  placement: "all",
  reviewed: "all",
  composition: "all",
  mistake: "all",
  encounterId: "all",
  from: "",
  to: "",
  sortField: "playedAt",
  sortDir: "desc",
};

/* ------------------------------------------------------------------ */
/* URL <-> query                                                       */
/* ------------------------------------------------------------------ */

/**
 * Every filter the Matches page owns, expressible as a query string.
 *
 * Charts drill down by linking here (`/matches?mistake=ECONOMY`), so the
 * mapping has to be complete in both directions: a filter the URL cannot
 * carry is a filter no chart can link to.
 */
const QUERY_PARAM_KEYS = [
  "search",
  "placement",
  "reviewed",
  "composition",
  "mistake",
  "encounterId",
  "from",
  "to",
  "sortField",
  "sortDir",
] as const;

/** Values equal to the default are left out, so URLs stay readable. */
function isDefault(key: string, value: string): boolean {
  if (value === "" || value === "all") return true;
  if (key === "sortField") return value === DEFAULT_MATCH_QUERY.sortField;
  if (key === "sortDir") return value === DEFAULT_MATCH_QUERY.sortDir;
  return false;
}

/** `MatchQuery` -> query string. Only non-default filters are written. */
export function queryToParams(query: MatchQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of QUERY_PARAM_KEYS) {
    const value = query[key];
    if (typeof value !== "string") continue;
    if (isDefault(key, value)) continue;
    params.set(key, value);
  }
  return params;
}

/**
 * Query string -> the filters it carries, ready to spread over
 * `EMPTY_MATCH_QUERY`. Anything absent keeps its default.
 */
export function paramsToQuery(params: URLSearchParams): Partial<MatchQuery> {
  const query: Partial<Record<(typeof QUERY_PARAM_KEYS)[number], string>> = {};
  for (const key of QUERY_PARAM_KEYS) {
    const value = params.get(key);
    if (value === null || value === "") continue;
    query[key] = value;
  }
  return query as Partial<MatchQuery>;
}
