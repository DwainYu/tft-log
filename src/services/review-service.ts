import { matchRepository } from "../data/repository/match-repository";
import { reviewDraftRepository } from "../data/repository/review-draft-repository";
import { reviewRepository } from "../data/repository/review-repository";
import { validateOpeningPlan } from "../domain/match/opening";
import {
  applyReviewInput,
  createReview,
  isReviewComplete,
  patchReview,
  validateReviewInput,
  type ReviewInput,
} from "../domain/review/review";
import { placementText } from "../domain/match/match";
import { ValidationError } from "../lib/errors";
import { nowIso } from "../lib/utils";
import type { OpeningPlan, Review, ReviewDraft } from "../domain/types";

export async function getReview(matchId: string): Promise<Review | undefined> {
  return reviewRepository.byMatch(matchId);
}

export async function allReviews(): Promise<Review[]> {
  return reviewRepository.all();
}

/**
 * Full 复盘 submit — must pass the 复盘结论 requirements.
 *
 * `openingPlan` rides along because the review page is where the structured
 * fact is captured, while the value itself belongs to the match (the table
 * every statistic reads). `undefined` = leave it alone (Quick Add path),
 * `null` = the player cleared it.
 */
export async function saveReview(
  matchId: string,
  input: ReviewInput,
  openingPlan?: OpeningPlan | null,
): Promise<Review> {
  const errors = [...validateReviewInput(input), ...validateOpeningPlan(openingPlan)];
  if (errors.length) throw new ValidationError(errors);
  return writeReview(matchId, input, openingPlan);
}

/**
 * Partial write used by Quick Add: stores what the player typed in the fast
 * flow without pretending the match has been reviewed.
 */
export async function seedReview(matchId: string, patch: ReviewInput): Promise<Review> {
  const existing = await reviewRepository.byMatch(matchId);
  const review = existing ? patchReview(existing, patch) : createReview(matchId, patch);
  return writeReviewRecord(review);
}

async function writeReview(
  matchId: string,
  input: ReviewInput,
  openingPlan?: OpeningPlan | null,
): Promise<Review> {
  const existing = await reviewRepository.byMatch(matchId);
  const review = existing ? applyReviewInput(existing, input) : createReview(matchId, input);
  return writeReviewRecord(review, openingPlan);
}

/**
 * Single place where a review and its match are kept consistent: `reviewed`
 * mirrors the conclusion block and `primaryMistake` stays on the match so
 * statistics only ever read one field.
 */
async function writeReviewRecord(
  review: Review,
  openingPlan?: OpeningPlan | null,
): Promise<Review> {
  const match = await matchRepository.get(review.matchId);
  if (!match) throw new ValidationError([`对局不存在：${review.matchId}`]);

  await reviewRepository.put(review);

  const reviewed = isReviewComplete(review);
  const primaryMistake = review.primaryMistake ?? match.primaryMistake;
  // `null` clears it, `undefined` keeps whatever is already on the match.
  const nextOpeningPlan =
    openingPlan === null ? undefined : (openingPlan ?? match.openingPlan);
  if (
    match.reviewed !== reviewed ||
    match.primaryMistake !== primaryMistake ||
    match.openingPlan !== nextOpeningPlan
  ) {
    await matchRepository.put({
      ...match,
      reviewed,
      primaryMistake,
      openingPlan: nextOpeningPlan,
      updatedAt: nowIso(),
    });
  }
  return review;
}

export async function deleteReview(matchId: string): Promise<void> {
  await reviewRepository.removeByMatch(matchId);
  // Deleting the write-up deletes anything half-written for it too: leaving a
  // draft behind would quietly bring the answers back into the drafts box.
  await reviewDraftRepository.remove(matchId);
  const match = await matchRepository.get(matchId);
  if (match?.reviewed) {
    await matchRepository.put({ ...match, reviewed: false, updatedAt: nowIso() });
  }
}

/* ------------------------------------------------------------------ */
/* Drafts — an unfinished 复盘, saved without asking                   */
/* ------------------------------------------------------------------ */

/** True when there is anything worth keeping: a blank form is not a draft. */
export function hasDraftContent(input: ReviewInput, openingPlan?: OpeningPlan): boolean {
  if (openingPlan) return true;
  return Object.values(input).some((v) =>
    typeof v === "number" ? true : typeof v === "string" && v.trim() !== "",
  );
}

/** Upsert the draft for a match. Called on a debounce by the review form. */
export async function saveReviewDraft(
  matchId: string,
  input: ReviewInput,
  openingPlan?: OpeningPlan,
): Promise<void> {
  if (!hasDraftContent(input, openingPlan)) {
    await reviewDraftRepository.remove(matchId);
    return;
  }
  const match = await matchRepository.get(matchId);
  const existing = await reviewDraftRepository.get(matchId);
  const now = nowIso();
  await reviewDraftRepository.put({
    matchId,
    input,
    openingPlan,
    sessionId: match?.sessionId ?? existing?.sessionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function getReviewDraft(matchId: string): Promise<ReviewDraft | undefined> {
  return reviewDraftRepository.get(matchId);
}

export async function deleteReviewDraft(matchId: string): Promise<void> {
  await reviewDraftRepository.remove(matchId);
}

/**
 * Drafts joined to their match, newest first.
 *
 * Matches that are already reviewed are filtered out even if a stale draft
 * row survived: once a 复盘 is complete its draft is deleted, so anything
 * left is a leftover, and showing it would blur the line between "finished"
 * and "still open".
 */
export async function draftSummaries(): Promise<
  {
    draft: ReviewDraft;
    matchId: string;
    matchLabel: string;
    playedAt: string;
    sessionId?: string;
    /** How many of the required conclusion fields are already answered. */
    filled: number;
    total: number;
  }[]
> {
  const [drafts, matches] = await Promise.all([
    reviewDraftRepository.all(),
    matchRepository.all(),
  ]);
  const byId = new Map(matches.map((m) => [m.id, m]));

  return drafts
    .filter((d) => {
      const m = byId.get(d.matchId);
      return m !== undefined && !m.reviewed;
    })
    .map((draft) => {
      const m = byId.get(draft.matchId)!;
      const input = draft.input;
      const required = [input.primaryMistake, input.biggestMistake, input.bestDecision, input.nextGameFocus];
      return {
        draft,
        matchId: draft.matchId,
        matchLabel: `${m.playedAt.slice(5, 10)} · ${placementText(m.placement)} · ${m.composition ?? "未填阵容"}`,
        playedAt: m.playedAt,
        sessionId: m.sessionId,
        filled: required.filter(Boolean).length,
        total: required.length,
      };
    })
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.matchId.localeCompare(b.matchId))
    .reverse();
}

/** Reviews joined to their match, newest first — Weekly Review + future agent tools. */
export async function recentReviews(limit: number): Promise<
  { review: Review; matchId: string; matchLabel: string }[]
> {
  const [reviews, matches] = await Promise.all([reviewRepository.all(), matchRepository.all()]);
  const byId = new Map(matches.map((m) => [m.id, m]));
  return reviews
    .filter((r) => byId.has(r.matchId))
    .sort(
      (a, b) =>
        byId.get(b.matchId)!.playedAt.localeCompare(byId.get(a.matchId)!.playedAt) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, limit)
    .map((review) => {
      const m = byId.get(review.matchId)!;
      return {
        review,
        matchId: m.id,
        matchLabel: `${m.playedAt.slice(5, 10)} · ${placementText(m.placement)} · ${m.composition ?? "未填阵容"}`,
      };
    });
}
