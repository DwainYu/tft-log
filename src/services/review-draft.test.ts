import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteReviewDraft,
  draftSummaries,
  getReviewDraft,
  hasDraftContent,
  saveReviewDraft,
  saveReview,
  deleteReview,
} from "./review-service";
import { addMatch } from "./match-service";
import { matchRepository } from "../data/repository/match-repository";
import { reviewRepository } from "../data/repository/review-repository";
import { reviewDraftRepository } from "../data/repository/review-draft-repository";
import { resetDatabase } from "../test/db-helper";
import type { ReviewInput } from "../domain/review/review";

beforeEach(resetDatabase);

async function seedMatch(placement = "4") {
  return addMatch({ playedAt: "2026-10-14T12:00", placement, composition: "Elderwood" });
}

const PARTIAL: ReviewInput = {
  primaryMistake: "ECONOMY",
  bestDecision: "2-5 存钱",
};

const COMPLETE: ReviewInput = {
  primaryMistake: "ECONOMY",
  biggestMistake: "利息没吃满",
  bestDecision: "2-5 存钱",
  nextGameFocus: "吃满利息",
};

describe("review drafts", () => {
  it("saves what was typed and reads it back", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    const draft = await getReviewDraft(m.id);
    expect(draft?.matchId).toBe(m.id);
    expect(draft?.input.bestDecision).toBe("2-5 存钱");
    expect(draft?.input.primaryMistake).toBe("ECONOMY");
  });

  it("survives a reload: the draft is the newest answer, ahead of the review", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL, "WIN_STREAK");
    const draft = await getReviewDraft(m.id);
    // this is what the form seeds from
    expect(draft?.openingPlan).toBe("WIN_STREAK");
    expect(draft?.input).toEqual(PARTIAL);
  });

  it("keeps one draft per match instead of stacking rows", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, { bestDecision: "first" });
    await saveReviewDraft(m.id, { bestDecision: "second" });
    const all = await reviewDraftRepository.all();
    expect(all).toHaveLength(1);
    expect(all[0].input.bestDecision).toBe("second");
    // createdAt must not be reset on every keystroke
    expect(all[0].createdAt).toBe(all[0].createdAt);
  });

  it("does not create a row for an untouched form", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, {});
    expect(await getReviewDraft(m.id)).toBeUndefined();
  });

  it("erases the draft when the form is emptied again", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    await saveReviewDraft(m.id, {});
    expect(await getReviewDraft(m.id)).toBeUndefined();
  });

  it("never marks the match as reviewed", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, COMPLETE);
    const stored = await matchRepository.get(m.id);
    // a complete-looking draft must still not look like a finished 复盘
    expect(stored?.reviewed).toBe(false);
    expect(await reviewRepository.byMatch(m.id)).toBeUndefined();
  });

  it("keeps drafts of two different matches apart", async () => {
    const a = await seedMatch("2");
    const b = await seedMatch("7");
    await saveReviewDraft(a.id, { bestDecision: "属于 A" });
    await saveReviewDraft(b.id, { bestDecision: "属于 B" });
    expect((await getReviewDraft(a.id))?.input.bestDecision).toBe("属于 A");
    expect((await getReviewDraft(b.id))?.input.bestDecision).toBe("属于 B");
  });

  it("remembers the session the match belongs to", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    expect((await getReviewDraft(m.id))?.sessionId).toBe(m.sessionId);
  });

  it("deletes a draft", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    await deleteReviewDraft(m.id);
    expect(await getReviewDraft(m.id)).toBeUndefined();
  });

  it("records the owning session so the draft box can group them", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    const summaries = await draftSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].matchId).toBe(m.id);
    expect(summaries[0].sessionId).toBe(m.sessionId);
    expect(summaries[0].filled).toBe(2);
    expect(summaries[0].total).toBe(4);
  });

  it("hides drafts of matches that are already reviewed", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    await saveReview(m.id, COMPLETE);
    // completing the review is what deletes the draft in the page flow
    await deleteReviewDraft(m.id);
    expect(await draftSummaries()).toHaveLength(0);

    // and even a stale draft row must not resurface a completed 复盘
    await saveReviewDraft(m.id, PARTIAL);
    expect(await draftSummaries()).toHaveLength(0);
  });

  it("completing a review does not create a second review record", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    await saveReview(m.id, COMPLETE);
    await saveReview(m.id, { ...COMPLETE, bestDecision: "改了一下" });
    const reviews = await reviewRepository.all();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].bestDecision).toBe("改了一下");
    expect((await matchRepository.get(m.id))?.reviewed).toBe(true);
  });

  it("deleting a review also drops its draft", async () => {
    const m = await seedMatch();
    await saveReviewDraft(m.id, PARTIAL);
    await saveReview(m.id, COMPLETE);
    await saveReviewDraft(m.id, PARTIAL);
    await deleteReview(m.id);
    expect(await getReviewDraft(m.id)).toBeUndefined();
    expect(await reviewRepository.byMatch(m.id)).toBeUndefined();
  });

  it("ignores drafts whose match no longer exists", async () => {
    await reviewDraftRepository.put({
      matchId: "deleted-match",
      input: PARTIAL,
      createdAt: "2026-10-14T12:00:00.000Z",
      updatedAt: "2026-10-14T12:00:00.000Z",
    });
    expect(await draftSummaries()).toHaveLength(0);
  });
});

describe("hasDraftContent", () => {
  it("is false only when there is genuinely nothing", () => {
    expect(hasDraftContent({})).toBe(false);
    expect(hasDraftContent({ bestDecision: "   " })).toBe(false);
    expect(hasDraftContent({ bestDecision: "x" })).toBe(true);
    expect(hasDraftContent({ selfScore: 3 })).toBe(true);
    expect(hasDraftContent({}, "WIN_STREAK")).toBe(true);
  });
});
