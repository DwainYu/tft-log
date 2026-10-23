import { ManualAdapter, type ManualMatchPayload } from "../data/adapters/manual-adapter";
import { decisionRepository } from "../data/repository/decision-repository";
import { matchRepository } from "../data/repository/match-repository";
import { reviewRepository } from "../data/repository/review-repository";
import {
  applyMatchInput,
  createMatch,
  validateMatchInput,
  type MatchInput,
} from "../domain/match/match";
import { normalizeCompositionKey } from "../domain/composition/composition";
import { queryMatches, type MatchQuery } from "../domain/match/query";
import { removeMatchScreenshots } from "./screenshot-service";
import { seedReview } from "./review-service";
import { recordCompositionUsage, rebuildCompositionUsage } from "./composition-usage-service";
import { ValidationError } from "../lib/errors";
import { dateKey, toDate } from "../lib/wallclock";
import { nowIso } from "../lib/utils";
import { getActiveSessionId } from "./session-service";
import { validateMatchStaticData } from "../data/tft/match-links";
import type { Decision, Match, MistakeType, Review } from "../domain/types";

export interface MatchBundle {
  match: Match;
  review?: Review;
  decisions: Decision[];
}

/** Static-data gate: reject canonical ids that do not exist in the active set. */
function assertStaticLinks(input: MatchInput): void {
  const errors = validateMatchStaticData(input);
  if (errors.length > 0) throw new ValidationError(errors);
}

/**
 * Usage counting happens exactly once per *created* match: creation is the only
 * point that means "one more game played with this composition". Editing a
 * match, saving its review, re-rendering or reloading must not bump it again.
 */
async function trackCompositionUsage(match: Match): Promise<void> {
  // 开局就建的记录里，`composition` 是「打算玩什么」，还不是最终阵容。
  // 等结算补齐名次之后再计入使用次数，否则计划阵容会污染 Recent / Frequent。
  if (match.placement === undefined) return;
  try {
    await recordCompositionUsage(match.composition, match.playedAt);
  } catch {
    // Derived data: never fail a match the player already saved.
  }
}

/**
 * The only way the UI writes matches. It goes through the ManualAdapter so a
 * future LCU / screenshot adapter can feed the exact same pipeline.
 *
 * Session rule: an explicit `sessionId` in the payload wins; otherwise the
 * match inherits the *active* session — new matches are never orphans.
 */
export async function addMatch(payload: ManualMatchPayload): Promise<Match> {
  const result = ManualAdapter.toMatchInput(payload);
  if (!result.ok) throw new ValidationError(result.errors);
  assertStaticLinks(result.value);
  const match = createMatch(result.value);
  if (!match.sessionId) match.sessionId = await getActiveSessionId();
  const saved = await matchRepository.add(match);
  await trackCompositionUsage(saved);
  return saved;
}

export async function updateMatch(id: string, payload: ManualMatchPayload): Promise<Match> {
  const existing = await matchRepository.get(id);
  if (!existing) throw new ValidationError([`对局不存在：${id}`]);
  const result = ManualAdapter.toMatchInput(payload);
  if (!result.ok) throw new ValidationError(result.errors);
  assertStaticLinks(result.value);
  const next = applyMatchInput(existing, result.value);
  // The structured fields are ones the form can also *empty*, and that has to
  // mean "cleared" rather than "not mentioned": `applyMatchInput` merges, so
  // an absent value would otherwise resurrect whatever the previous version of
  // this record had — including a placement the player deleted.
  if (payload.openingPlan === "") next.openingPlan = undefined;
  if (payload.encounterId === "") next.encounterId = undefined;
  // 编辑表单提交的就是这一局的全部已知信息，名次留空即「还没结果」。
  // （未来的 LCU / OCR 只补赛果的写入要走 `saveMatchInput` 那样的合并入口：
  //  那里不提 `placement` 才是「沿用原来的值」。）
  // 用 delete 而不是赋 undefined：把键本身摘掉，存储里才不会留下一个
  // `placement: undefined` 的僵尸键。
  if (result.value.placement === undefined) delete next.placement;
  if (!next.sessionId) next.sessionId = existing.sessionId ?? (await getActiveSessionId());
  await matchRepository.put(next);
  await syncCompositionUsage(existing, next);
  return next;
}

/**
 * 阵容使用表只在两个时机同步：结算这一步（开局建的记录里 composition 还是
 * 「打算玩什么」），以及已结算的局改了阵容。编辑路径不走
 * `trackCompositionUsage`，所以这里用一次幂等重建补齐；两个条件同局同改时
 * 也只重建一次。`updateMatch` 和 `saveMatchInput` 共用，保证普通编辑和
 * 未来 LCU / OCR 的结算写入行为一致。
 */
async function syncCompositionUsage(existing: Match, next: Match): Promise<void> {
  const compositionChanged =
    normalizeCompositionKey(existing.composition) !== normalizeCompositionKey(next.composition);
  if (
    (existing.placement === undefined && next.placement !== undefined) ||
    (next.placement !== undefined && compositionChanged)
  ) {
    try {
      await rebuildCompositionUsage();
    } catch {
      // Derived data — a failure here must never fail a save the player made.
    }
  }
}

/** Edit path that already holds a typed input (used by import + tests). */
export async function saveMatchInput(input: MatchInput, id?: string): Promise<Match> {
  const errors = validateMatchInput(input);
  if (errors.length) throw new ValidationError(errors);
  assertStaticLinks(input);
  if (id) {
    const existing = await matchRepository.get(id);
    if (existing) {
      const next = applyMatchInput(existing, input);
      if (!next.sessionId) next.sessionId = existing.sessionId ?? (await getActiveSessionId());
      await matchRepository.put(next);
      await syncCompositionUsage(existing, next);
      return next;
    }
  }
  const match = createMatch(input);
  if (!match.sessionId) match.sessionId = await getActiveSessionId();
  const saved = await matchRepository.add(match);
  await trackCompositionUsage(saved);
  return saved;
}

export async function deleteMatch(id: string): Promise<void> {
  await Promise.all([
    matchRepository.remove(id),
    decisionRepository.removeByMatch(id),
    reviewRepository.removeByMatch(id),
    // Screenshots go the same way decisions and reviews do: a deleted match
    // must not leave images behind that no list can reach.
    removeMatchScreenshots(id),
  ]);
  // The usage table is derived from `matches`, so a deleted game must not keep
  // offering its composition in the selector. `replaceAll` upserts before it
  // prunes, and the failure is swallowed on purpose: a stale suggestion row is
  // cosmetic, while failing the delete the player asked for is not.
  try {
    await rebuildCompositionUsage();
  } catch {
    /* derived data */
  }
}

export async function getMatch(id: string): Promise<Match | undefined> {
  return matchRepository.get(id);
}

export async function allMatches(): Promise<Match[]> {
  return matchRepository.all();
}

export async function listMatches(query: MatchQuery = {}): Promise<Match[]> {
  return queryMatches(await matchRepository.all(), query);
}

export async function recentMatches(limit: number, query: MatchQuery = {}): Promise<Match[]> {
  return (await listMatches({ sortField: "playedAt", sortDir: "desc", ...query })).slice(0, limit);
}

/**
 * 最近一条还没结算的对局（没有名次）：开局或进行中开的那条记录。
 *
 * 用来给「继续记这一局」一个落点。一局是一条可以持续完善的记录，所以这里
 * 返回的是已有的那条，而不是新建一条。
 */
export async function latestUnfinishedMatch(): Promise<Match | undefined> {
  const matches = await matchRepository.all();
  return matches
    .filter((m) => m.placement === undefined)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))[0];
}

/** `null` = no such match; callers rely on distinguishing that from "loading". */
export async function getMatchBundle(id: string): Promise<MatchBundle | null> {
  const match = await matchRepository.get(id);
  if (!match) return null;
  const [review, decisions] = await Promise.all([
    reviewRepository.byMatch(id),
    decisionRepository.byMatch(id),
  ]);
  return { match, review, decisions };
}

export async function setPrimaryMistake(id: string, mistake?: MistakeType): Promise<void> {
  const match = await matchRepository.get(id);
  if (!match) return;
  await matchRepository.put({ ...match, primaryMistake: mistake, updatedAt: nowIso() });
}

export async function setReviewed(id: string, reviewed: boolean): Promise<void> {
  const match = await matchRepository.get(id);
  if (!match) return;
  await matchRepository.put({ ...match, reviewed, updatedAt: nowIso() });
}

/** Compositions already logged, for autocompletion in Quick Add. */
export async function knownCompositions(): Promise<string[]> {
  const matches = await matchRepository.all();
  const counts = new Map<string, number>();
  for (const m of matches) {
    const key = normalizeCompositionKey(m.composition);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** Days (date keys) that have at least one match, newest first. */
export async function trainedDateKeys(): Promise<string[]> {
  const matches = await matchRepository.all();
  return [...new Set(matches.map((m) => dateKey(m.playedAt)))]
    .filter((d) => Boolean(toDate(`${d}T00:00`)))
    .sort((a, b) => b.localeCompare(a));
}

/**
 * Quick Add: log a game in under a minute. The match lands in the active
 * session automatically — no session field in the fast path.
 * `nextGameFocus` is stored on the review record (seeded, not "reviewed") so
 * the fast path and the detailed review never disagree about what the
 * player meant.
 */
export async function quickAdd(
  payload: ManualMatchPayload,
  nextGameFocus?: string,
): Promise<Match> {
  const match = await addMatch(payload);
  const focus = nextGameFocus?.trim();
  if (focus) await seedReview(match.id, { nextGameFocus: focus });
  return match;
}
