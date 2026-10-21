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
  type SessionType,
  type TrainingGoal,
  type TrainingSession,
} from "../domain/types";
import { nowIso } from "../lib/utils";
import { toDate } from "../lib/wallclock";
import { validateMatchStaticData, encounterIdOrUndefined } from "../data/tft/match-links";
import { deleteAllScreenshots, screenshotStorage } from "./screenshot-service";

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Export scope — full backup, 云巅 only, or 日常 only                 */
/* ------------------------------------------------------------------ */

/**
 * Which slice of the database an export covers.
 *
 * `all` is the backup: everything, byte-identical to pre-scope exports.
 * `competition` / `daily` split on `TrainingSession.type`, which is the only
 * field that says what kind of training a game belongs to.
 */
export const EXPORT_SCOPES = ["all", "competition", "daily"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export const EXPORT_SCOPE_LABELS: Record<ExportScope, string> = {
  all: "全部数据（完整备份）",
  competition: "仅云巅 Session",
  daily: "仅日常 Session",
};

export interface ExportSummary {
  sessions: number;
  matches: number;
  decisions: number;
  reviews: number;
  /**
   * Matches whose Session cannot be resolved (no `sessionId`, or it names a
   * Session that no longer exists). They travel in the *day-to-day* export
   * rather than being dropped — `importSnapshot` assigns exactly those records
   * to the built-in daily Session anyway, so keeping them here round-trips
   * truthfully and nothing disappears without being counted.
   */
  unclassifiedMatches: number;
}

/**
 * Slice a snapshot down to one Session type.
 *
 * Pure and DB-free so the filtering is unit-testable; `buildSnapshot` below
 * just hands it whatever the repositories returned.
 *
 * Kept deliberately conservative about what travels with a Session: decisions
 * and reviews are filtered by the surviving match ids, so a scoped export can
 * never carry a child record whose parent match it does not include. Training
 * goals are global (they have no Session), so they stay in every scope — that
 * way no export can lose one.
 */
export function scopeSnapshot(snapshot: DatabaseSnapshot, scope: ExportScope): DatabaseSnapshot {
  if (scope === "all") return snapshot;

  const sessions = snapshot.trainingSessions.filter((s) => s.type === scope);

  // A match travels with its *Session's* type, never with its own properties:
  // whether one game was played "well" is a per-game fact and says nothing
  // about which training context it belongs to. Records whose Session cannot
  // be resolved fall to `daily`, which is exactly where `importSnapshot` puts
  // them, so the round trip neither invents nor loses anything.
  const matches = snapshot.matches.filter((m) => {
    const type = typeOfSessionId(m.sessionId, snapshot.trainingSessions);
    if (type === undefined) return scope === "daily";
    return type === scope;
  });

  const matchIds = new Set(matches.map((m) => m.id));
  return {
    ...snapshot,
    // The marker a re-import uses to decide what kind of file this is.
    scope,
    trainingSessions: sessions,
    matches,
    decisions: snapshot.decisions.filter((d) => matchIds.has(d.matchId)),
    reviews: snapshot.reviews.filter((r) => matchIds.has(r.matchId)),
    trainingGoals: snapshot.trainingGoals,
  };
}

/**
 * The Session type a match belongs to, or `undefined` when that cannot be
 * answered — never a guess. The built-in daily Session keeps its type even if
 * its row were missing, because `DAILY_SESSION_ID` *is* the daily Session.
 */
function typeOfSessionId(
  sessionId: string | undefined,
  sessions: TrainingSession[],
): SessionType | undefined {
  if (sessionId === DAILY_SESSION_ID) return "daily";
  if (!sessionId) return undefined;
  return sessions.find((s) => s.id === sessionId)?.type;
}

/** Build a snapshot for one scope. `all` is exactly today's full backup. */
export async function buildSnapshot(scope: ExportScope = "all"): Promise<DatabaseSnapshot> {
  const [matches, decisions, reviews, trainingGoals, trainingSessions] = await Promise.all([
    matchRepository.all(),
    decisionRepository.all(),
    reviewRepository.all(),
    trainingGoalRepository.all(),
    trainingSessionRepository.all(),
  ]);
  const snapshot: DatabaseSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: nowIso(),
    app: "tft-training-log",
    matches,
    decisions,
    reviews,
    trainingGoals,
    trainingSessions,
  };
  return scope === "all" ? snapshot : scopeSnapshot(snapshot, scope);
}

/** Snapshot plus the counts the Data page reports back after downloading. */
export async function buildScopedExport(
  scope: ExportScope,
): Promise<{ snapshot: DatabaseSnapshot; summary: ExportSummary }> {
  const snapshot = await buildSnapshot(scope);
  const unclassifiedMatches =
    scope === "all" ? 0 : countUnclassified(snapshot.matches, snapshot.trainingSessions);
  return {
    snapshot,
    summary: {
      sessions: snapshot.trainingSessions.length,
      matches: snapshot.matches.length,
      decisions: snapshot.decisions.length,
      reviews: snapshot.reviews.length,
      unclassifiedMatches,
    },
  };
}

function countUnclassified(matches: Match[], sessions: TrainingSession[]): number {
  return matches.filter((m) => typeOfSessionId(m.sessionId, sessions) === undefined).length;
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
    throw new Error("不是 TFT 日志 导出的文件（缺少 app 标识）");
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

export async function storageCounts(): Promise<{
  matches: number;
  decisions: number;
  reviews: number;
  trainingGoals: number;
  screenshots: number;
  screenshotBytes: number;
}> {
  const [m, d, r, g, shots] = await Promise.all([
    matchRepository.all(),
    decisionRepository.all(),
    reviewRepository.all(),
    trainingGoalRepository.all(),
    screenshotStorage(),
  ]);
  return {
    matches: m.length,
    decisions: d.length,
    reviews: r.length,
    trainingGoals: g.length,
    screenshots: shots.count,
    screenshotBytes: shots.bytes,
  };
}

export async function wipeAll(): Promise<void> {
  await Promise.all([
    matchRepository.clear(),
    decisionRepository.clear(),
    reviewRepository.clear(),
    trainingGoalRepository.clear(),
    // derived from matches — nothing left to derive from means nothing to keep
    compositionUsageRepository.clear(),
    // Image bytes are the one thing IndexedDB keeps that a JSON backup does
    // not carry, so leaving them here would be unrecoverable garbage.
    deleteAllScreenshots(),
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
