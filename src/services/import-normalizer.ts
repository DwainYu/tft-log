import {
  DAILY_SESSION_ID,
  SESSION_TYPES,
  type DatabaseSnapshot,
  type Decision,
  type Match,
  type Review,
  type TrainingGoal,
  type TrainingSession,
} from "../domain/types";
import { isPlacement } from "../domain/match/match";
import { openingPlanOrUndefined } from "../domain/match/opening";
import { encounterIdOrUndefined, validateMatchStaticData } from "../data/tft/match-links";
import { isValidWallClock, toDate } from "../lib/wallclock";

export interface PreparedImportSnapshot {
  sessions: TrainingSession[];
  matches: Match[];
  decisions: Decision[];
  reviews: Review[];
  trainingGoals: TrainingGoal[];
  skipped: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const hasId = (r: Record<string, unknown>): boolean =>
  typeof r.id === "string" && r.id.length > 0;

const isDateOnly = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && toDate(v) !== null;

/**
 * Validate and normalize a snapshot without touching IndexedDB.
 *
 * A Match's Session may be one that already exists locally or one introduced
 * by a valid Session row in this same snapshot. Invalid Session rows never
 * enter that lookup set.
 */
export function prepareImportSnapshot(
  snapshot: DatabaseSnapshot,
  existingSessionIds: Iterable<string>,
  now: () => string,
): PreparedImportSnapshot {
  const rawSessions = Array.isArray(snapshot.trainingSessions) ? snapshot.trainingSessions : [];
  const sessions: TrainingSession[] = [];
  for (const s of rawSessions) {
    if (
      !isRecord(s) ||
      !hasId(s) ||
      !SESSION_TYPES.includes(s.type) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      !isDateOnly(s.startDate) ||
      (s.endDate !== undefined && !isDateOnly(s.endDate))
    ) {
      continue;
    }
    const timestamp = now();
    sessions.push({
      id: s.id,
      type: s.type,
      name: s.name.trim(),
      description: typeof s.description === "string" ? s.description : undefined,
      startDate: s.startDate,
      endDate: s.endDate ?? undefined,
      active: typeof s.active === "boolean" ? s.active : true,
      createdAt: typeof s.createdAt === "string" ? s.createdAt : timestamp,
      updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : timestamp,
    });
  }

  const knownSessionIds = new Set<string>([
    DAILY_SESSION_ID,
    ...existingSessionIds,
    ...sessions.map((s) => s.id),
  ]);

  // Matches carrying canonical S18 ids are additionally gated. Placement is
  // optional for in-progress or partially recognised games, but a present
  // value must be 1-8. A missing or malformed `playedAt` is skipped because
  // it would crash every date-reading page.
  const validMatches = snapshot.matches.filter(
    (m) =>
      isRecord(m) &&
      hasId(m) &&
      (m.placement === undefined || isPlacement(m.placement)) &&
      typeof m.playedAt === "string" &&
      isValidWallClock(m.playedAt) &&
      validateMatchStaticData(m).length === 0,
  );
  const matches: Match[] = validMatches.map((m) => ({
    ...m,
    sessionId:
      typeof m.sessionId === "string" && m.sessionId.length > 0 && knownSessionIds.has(m.sessionId)
        ? m.sessionId
        : DAILY_SESSION_ID,
    // A structured value the vocabulary does not know is dropped, not kept:
    // it would otherwise land in a statistic nobody can reproduce. Both stay
    // `undefined` (= never recorded) rather than being coerced, which is what
    // keeps old records byte-identical to new ones that simply never touched
    // these fields.
    openingPlan: openingPlanOrUndefined(m.openingPlan),
    encounterId: encounterIdOrUndefined(m.encounterId),
  }));

  const validMatchIds = new Set(matches.map((m) => m.id));
  const decisions = snapshot.decisions.filter(
    (d) => isRecord(d) && hasId(d) && typeof d.matchId === "string" && validMatchIds.has(d.matchId),
  );
  const reviews = snapshot.reviews.filter(
    (r) => isRecord(r) && hasId(r) && typeof r.matchId === "string" && validMatchIds.has(r.matchId),
  );
  const trainingGoals = snapshot.trainingGoals.filter(
    (g) => isRecord(g) && hasId(g) && typeof g.title === "string",
  );

  const skipped =
    (rawSessions.length - sessions.length) +
    (snapshot.matches.length - matches.length) +
    (snapshot.decisions.length - decisions.length) +
    (snapshot.reviews.length - reviews.length) +
    (snapshot.trainingGoals.length - trainingGoals.length);

  return {
    sessions,
    matches,
    decisions: decisions as Decision[],
    reviews: reviews as Review[],
    trainingGoals: trainingGoals as TrainingGoal[],
    skipped,
  };
}
