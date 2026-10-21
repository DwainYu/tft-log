import { toDate } from "../../lib/wallclock";
import { nowIso } from "../../lib/utils";
import { isPlacement } from "../match/match";
import type { CompositionUsage } from "../types";

/**
 * Composition keys are how the app groups free-text composition names.
 *
 * Players type them fast and inconsistently, so everything that treats a
 * composition as a *key* (statistics, usage tracking, filters, lookups) must
 * funnel through `normalizeCompositionKey`. Nothing here is fuzzy on purpose:
 * no pinyin, no case folding, no "did you mean" — the same input must always
 * produce the same key, and every key must be readable enough to render.
 */

/**
 * Trim outside, collapse whitespace runs inside:
 * `"福牛"`, `"福牛 "`, `" 福牛"`, `"福牛  战神"` -> `"福牛"`, `"福牛 战神"`.
 * `\s` covers tabs, newlines and the full-width space a Chinese IME may emit.
 */
export function normalizeCompositionKey(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

/** Anything with the two fields usage tracking derives from. `Match` satisfies it. */
export interface CompositionUsageSource {
  composition?: string;
  playedAt: string;
  /** 可选：使用统计只认已结算（有名次）的局，见 `hasResult`。 */
  placement?: number;
}

/**
 * Fold a match history into one usage row per composition key — a pure
 * `matches -> rows` rebuild used both by the Dexie v2 -> v3 migration and by
 * `rebuildCompositionUsage()`. Running it again over the same matches yields
 * exactly the same rows, so rebuilds never inflate counts.
 *
 * `fallbackIso` covers records whose `playedAt` is not a real instant.
 */
export function summarizeCompositionUsage(
  matches: readonly CompositionUsageSource[],
  fallbackIso: string = nowIso(),
): CompositionUsage[] {
  const counts = new Map<string, number>();
  const firstAt = new Map<string, string>();
  const lastAt = new Map<string, string>();

  for (const m of matches) {
    // 使用统计 = 「用这套阵容打完了几局」。开局 / 进行中的记录里 composition
    // 是打算玩什么，不是最终阵容，混进来会污染 Recent / Frequent。
    if (m.placement === undefined || !isPlacement(m.placement)) continue;
    const key = normalizeCompositionKey(m.composition);
    if (!key) continue;
    const at = toDate(m.playedAt)?.toISOString() ?? fallbackIso;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    firstAt.set(key, minIso(firstAt.get(key), at));
    lastAt.set(key, maxIso(lastAt.get(key), at));
  }

  return [...counts.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((compositionKey) => ({
      compositionKey,
      usageCount: counts.get(compositionKey)!,
      firstUsedAt: firstAt.get(compositionKey)!,
      lastUsedAt: lastAt.get(compositionKey)!,
    }));
}

/** ISO-8601 UTC strings sort chronologically, so plain string order is safe. */
export function minIso(a: string | undefined, b: string): string {
  return a !== undefined && a <= b ? a : b;
}

export function maxIso(a: string | undefined, b: string): string {
  return a !== undefined && a >= b ? a : b;
}
