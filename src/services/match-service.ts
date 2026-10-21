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
import { recordCompositionUsage } from "./composition-usage-service";
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
  // The two structured opening fields are closed vocabularies the form can
  // also *empty*, and that has to mean "cleared" rather than "not mentioned":
  // `applyMatchInput` merges, so an absent value would otherwise resurrect
  // whatever the previous version of this record had.
  if (payload.openingPlan === "") next.openingPlan = undefined;
  if (payload.encounterId === "") next.encounterId = undefined;
  if (!next.sessionId) next.sessionId = existing.sessionId ?? (await getActiveSessionId());
  await matchRepository.put(next);
  return next;
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
