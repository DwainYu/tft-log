import { compositionUsageRepository } from "../data/repository/composition-usage-repository";
import { decisionRepository } from "../data/repository/decision-repository";
import { matchRepository } from "../data/repository/match-repository";
import { openingPlanOrUndefined } from "../domain/match/opening";
import { rebuildCompositionUsage } from "./composition-usage-service";
import { reviewRepository } from "../data/repository/review-repository";
import { trainingGoalRepository } from "../data/repository/training-goal-repository";
import { trainingSessionRepository } from "../data/repository/training-session-repository";
import {
  DAILY_SESSION_ID,
  SESSION_TYPES,
  SNAPSHOT_SCHEMA_VERSION,
  type DatabaseSnapshot,
  type Decision,
  type Match,
  type Review,
  type TrainingGoal,
  type TrainingSession,
} from "../domain/types";
import { nowIso } from "../lib/utils";
import { toDate } from "../lib/wallclock";
import { validateMatchStaticData, encounterIdOrUndefined } from "../data/tft/match-links";

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export async function buildSnapshot(): Promise<DatabaseSnapshot> {
  const [matches, decisions, reviews, trainingGoals, trainingSessions] = await Promise.all([
    matchRepository.all(),
    decisionRepository.all(),
    reviewRepository.all(),
    trainingGoalRepository.all(),
    trainingSessionRepository.all(),
  ]);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: nowIso(),
    app: "tft-training-log",
    matches,
    decisions,
    reviews,
    trainingGoals,
    trainingSessions,
  };
}

export function snapshotToJson(snapshot: DatabaseSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const CSV_COLUMNS: { key: keyof Match & string; header: string }[] = [
  { key: "id", header: "id" },
  { key: "playedAt", header: "played_at" },
  { key: "placement", header: "placement" },
  { key: "composition", header: "composition" },
  { key: "finalLevel", header: "final_level" },
  { key: "finalHealth", header: "final_health" },
  { key: "durationSeconds", header: "duration_seconds" },
  { key: "primaryMistake", header: "primary_mistake" },
  { key: "reviewed", header: "reviewed" },
  { key: "openingPlan", header: "opening_plan" },
  { key: "encounterId", header: "encounter_id" },
  { key: "notes", header: "notes" },
  { key: "sessionId", header: "session_id" },
];

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function matchesToCsv(matches: Match[]): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(",")];
  for (const m of matches) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(m[c.key])).join(","));
  }
  return lines.join("\n");
}

export function decisionsToCsv(decisions: Decision[]): string {
  const header = ["id", "matchId", "round", "type", "situation", "decision", "reasoning", "result", "hindsight"];
  const lines = [header.join(",")];
  for (const d of decisions) {
    lines.push(
      [d.id, d.matchId, d.round, d.type, d.situation, d.decision, d.reasoning, d.result, d.hindsight]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportReport {
  matches: number;
  decisions: number;
  reviews: number;
  trainingGoals: number;
  sessions: number;
  skipped: number;
  importedAt: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const hasId = (r: Record<string, unknown>): boolean =>
  typeof r.id === "string" && r.id.length > 0;

const isDateOnly = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && toDate(v) !== null;

/** Parse + sanity-check the JSON the player uploaded. Throws on bad shape. */
export function parseSnapshot(text: string): DatabaseSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("文件不是合法的 JSON");
  }
  if (!isRecord(raw) || raw.app !== "tft-training-log") {
    throw new Error("不是 TFT 弈记 导出的文件（缺少 app 标识）");
  }
  const snap = raw as Partial<DatabaseSnapshot>;
  for (const key of ["matches", "decisions", "reviews", "trainingGoals"] as const) {
    if (!Array.isArray(snap[key])) {
      throw new Error(`文件缺少 ${key} 数组`);
    }
  }
  // `trainingSessions` is optional: snapshots exported before Phase 2.5
  // (schema v1) simply do not carry it and import as `[]`.
  if (snap.trainingSessions !== undefined && !Array.isArray(snap.trainingSessions)) {
    throw new Error("trainingSessions 不是数组");
  }
  return snap as DatabaseSnapshot;
}

/**
 * Merge semantics (upsert by id): importing a backup never destroys newer
 * local records — this keeps the tool safe to use with old exports.
 *
 * Session rules:
 *  - a match's `sessionId` is kept only when it names a session that exists
 *    in the local DB or travels inside the same snapshot;
 *  - missing or unknown `sessionId` normalizes to the built-in `daily`
 *    session, so an import can never create orphan "session-less" matches.
 */
export async function importSnapshot(snapshot: DatabaseSnapshot): Promise<ImportReport> {
  let skipped = 0;

  const rawSessions = Array.isArray(snapshot.trainingSessions) ? snapshot.trainingSessions : [];
  const validSessions: TrainingSession[] = [];
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
    const now = nowIso();
    validSessions.push({
      id: s.id,
      type: s.type,
      name: s.name.trim(),
      description: typeof s.description === "string" ? s.description : undefined,
      startDate: s.startDate,
      endDate: s.endDate ?? undefined,
      active: typeof s.active === "boolean" ? s.active : true,
      createdAt: typeof s.createdAt === "string" ? s.createdAt : now,
      updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : now,
    });
  }
  // sessions first — imported matches may reference the new sessions
  await trainingSessionRepository.bulkPut(validSessions);

  const knownSessionIds = new Set<string>([
    DAILY_SESSION_ID,
    ...(await trainingSessionRepository.all()).map((s) => s.id),
  ]);

  // Matches carrying canonical S18 ids are additionally gated: an id that the
  // static snapshot does not know about is skipped, not silently imported.
  const validMatches = snapshot.matches.filter(
    (m) =>
      isRecord(m) && hasId(m) && typeof m.placement === "number" && validateMatchStaticData(m).length === 0,
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
  const trainingGoals = snapshot.trainingGoals.filter((g) => isRecord(g) && hasId(g) && typeof g.title === "string");

  skipped +=
    (rawSessions.length - validSessions.length) +
    (snapshot.matches.length - matches.length) +
    (snapshot.decisions.length - decisions.length) +
    (snapshot.reviews.length - reviews.length) +
    (snapshot.trainingGoals.length - trainingGoals.length);

  // children first, parents last — a review/decision is only useful with its match
  await Promise.all([
    matchRepository.bulkPut(matches),
    decisionRepository.bulkPut(decisions as Decision[]),
    reviewRepository.bulkPut(reviews as Review[]),
    trainingGoalRepository.bulkPut(trainingGoals as TrainingGoal[]),
  ]);

  // Composition usage is derived from matches, so it never travels inside a
  // snapshot — recompute it from the merged history instead. Best effort: an
  // import must not fail because of counters we can rebuild any time.
  try {
    await rebuildCompositionUsage();
  } catch {
    /* derived data */
  }

  return {
    matches: matches.length,
    decisions: decisions.length,
    reviews: reviews.length,
    trainingGoals: trainingGoals.length,
    sessions: validSessions.length,
    skipped,
    importedAt: nowIso(),
  };
}

export async function storageCounts(): Promise<{ matches: number; decisions: number; reviews: number; trainingGoals: number }> {
  const [m, d, r, g] = await Promise.all([
    matchRepository.all(),
    decisionRepository.all(),
    reviewRepository.all(),
    trainingGoalRepository.all(),
  ]);
  return { matches: m.length, decisions: d.length, reviews: r.length, trainingGoals: g.length };
}

export async function wipeAll(): Promise<void> {
  await Promise.all([
    matchRepository.clear(),
    decisionRepository.clear(),
    reviewRepository.clear(),
    trainingGoalRepository.clear(),
    // derived from matches — nothing left to derive from means nothing to keep
    compositionUsageRepository.clear(),
  ]);
}

/* ------------------------------------------------------------------ */
/* Browser download helper (thin — the pure builders above are tested) */
/* ------------------------------------------------------------------ */

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function stampForFilename(): string {
  return nowIso().replace(/[:.]/g, "-").slice(0, 19);
}
