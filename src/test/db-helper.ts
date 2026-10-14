import { db } from "../data/db";

/** Wipe every store — call from `beforeEach` to keep service tests independent. */
export async function resetDatabase(): Promise<void> {
  await Promise.all([
    db.matches.clear(),
    db.decisions.clear(),
    db.reviews.clear(),
    db.trainingGoals.clear(),
    db.trainingSessions.clear(),
    db.settings.clear(),
    db.compositionUsage.clear(),
    db.reviewDrafts.clear(),
  ]);
}

export { db };
