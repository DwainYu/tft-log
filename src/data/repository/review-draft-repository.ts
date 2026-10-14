import type { ReviewDraft } from "../../domain/types";
import { db } from "../db";

/**
 * Unfinished 复盘 answers, one row per match.
 *
 * Nothing here ever marks a match as reviewed — that stays the exclusive job
 * of `Review`, which is what `match.reviewed` and every statistic read.
 */
export interface ReviewDraftRepository {
  put(draft: ReviewDraft): Promise<ReviewDraft>;
  get(matchId: string): Promise<ReviewDraft | undefined>;
  all(): Promise<ReviewDraft[]>;
  remove(matchId: string): Promise<void>;
  clear(): Promise<void>;
}

export const reviewDraftRepository: ReviewDraftRepository = {
  async put(draft) {
    await db.reviewDrafts.put(draft);
    return draft;
  },
  async get(matchId) {
    return db.reviewDrafts.get(matchId);
  },
  async all() {
    return db.reviewDrafts.toArray();
  },
  async remove(matchId) {
    await db.reviewDrafts.delete(matchId);
  },
  async clear() {
    await db.reviewDrafts.clear();
  },
};
