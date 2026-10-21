import { createId, nowIso, parseList, round } from "../../lib/utils";
import { secondsBetween, isValidWallClock, toWallClock } from "../../lib/wallclock";
import { isOpeningPlan } from "./opening";
import {
  MAX_PLACEMENT,
  TOP4_PLACEMENT,
  type Match,
  type MistakeType,
  type OpeningPlan,
} from "../types";

/** Typed payload accepted by the service layer (already parsed from the form). */
export interface MatchInput {
  playedAt: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  /**
   * 1 – 8。可选：开局就开一条记录时名次还没有产生，此时必须留空。
   * 空 = 未记录（不是 0）—— 没有名次的对局不参与任何赛果统计。
   */
  placement?: number;
  finalLevel?: number;
  finalHealth?: number;
  totalGold?: number;
  composition?: string;
  traits?: string[];
  coreUnits?: string[];
  coreItems?: string[];
  augments?: string[];
  /** Canonical S18 static-data ids (optional; see `Match` docs). */
  set?: number;
  traitIds?: string[];
  coreUnitIds?: string[];
  coreItemIds?: string[];
  augmentIds?: string[];
  /** Owning training session; the service layer fills the active one. */
  sessionId?: string;
  primaryMistake?: MistakeType;
  notes?: string;
  /** Structured 复盘 fact; see `OPENING_PLANS`. Absent = not marked. */
  openingPlan?: OpeningPlan;
  /** Opening encounter id from the active set's catalog. Absent = not recorded. */
  encounterId?: string;
}

/**
 * The structural subset that query and statistics helpers need. Real `Match`
 * records satisfy it, and tests can build tiny fixtures instead.
 */
export interface MatchForQuery {
  id: string;
  playedAt: string;
  /** 可选：赛果未产生（开局 / 进行中）时 absent。 */
  placement?: number;
  reviewed: boolean;
  durationSeconds?: number;
  composition?: string;
  traits?: string[];
  coreUnits?: string[];
  coreItems?: string[];
  augments?: string[];
  primaryMistake?: MistakeType;
  notes?: string;
  sessionId?: string;
  /** Opening encounter id — see `Match.encounterId`. */
  encounterId?: string;
}

export function createMatch(input: MatchInput): Match {
  const now = nowIso();
  return {
    id: createId(),
    ...normalize(input),
    reviewed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyMatchInput(match: Match, input: MatchInput): Match {
  return { ...match, ...normalize(input), updatedAt: nowIso() };
}

/** Fill derived fields and drop empty optionals so records stay small. */
function normalize(input: MatchInput): MatchInput {
  const playedAt = input.playedAt.trim();
  const startedAt = input.startedAt?.trim() || undefined;
  const endedAt = input.endedAt?.trim() || undefined;

  let durationSeconds = positiveOrUndefined(input.durationSeconds);
  if (durationSeconds === undefined && startedAt && endedAt) {
    durationSeconds = secondsBetween(startedAt, endedAt);
  }

  return compact({
    playedAt,
    startedAt,
    endedAt,
    durationSeconds,
    placement: placementOrUndefined(input.placement),
    finalLevel: positiveOrUndefined(input.finalLevel),
    finalHealth: nonNegativeOrUndefined(input.finalHealth),
    totalGold: nonNegativeOrUndefined(input.totalGold),
    composition: input.composition?.trim() || undefined,
    traits: listOrUndefined(input.traits),
    coreUnits: listOrUndefined(input.coreUnits),
    coreItems: listOrUndefined(input.coreItems),
    augments: listOrUndefined(input.augments),
    set: positiveOrUndefined(input.set),
    traitIds: idsOrUndefined(input.traitIds),
    coreUnitIds: idsOrUndefined(input.coreUnitIds),
    coreItemIds: idsOrUndefined(input.coreItemIds),
    augmentIds: idsOrUndefined(input.augmentIds),
    sessionId: input.sessionId?.trim() || undefined,
    primaryMistake: input.primaryMistake || undefined,
    notes: input.notes?.trim() || undefined,
    openingPlan: input.openingPlan || undefined,
    encounterId: input.encounterId?.trim() || undefined,
  }) as MatchInput;
}

export function validateMatchInput(input: Partial<MatchInput>): string[] {
  const errors: string[] = [];
  if (!input.playedAt || !isValidWallClock(input.playedAt)) {
    errors.push("对局时间格式不正确");
  }
  // 名次可选：开局就开记录时它还不存在，留空比填 0 正确 —— 0 会被当成
  // 一条真实赛果进入平均名次。只有「填了但填错」才算错误。
  if (input.placement !== undefined && !isPlacement(input.placement)) {
    errors.push(`名次必须是 1 – ${MAX_PLACEMENT} 的整数`);
  }
  if (input.finalLevel !== undefined && (input.finalLevel < 1 || input.finalLevel > 12)) {
    errors.push("最终等级应在 1 – 12 之间");
  }
  // 结束时剩余血量：0 – 100，且不允许负数 / 非数字。留空永远是合法的
  // 「不知道」，只有填错才是错误。
  if (
    input.finalHealth !== undefined &&
    (!Number.isFinite(input.finalHealth) || input.finalHealth < 0 || input.finalHealth > 100)
  ) {
    errors.push("结束时剩余血量应为 0 – 100 的数字");
  }
  if (
    input.durationSeconds !== undefined &&
    (input.durationSeconds < 0 || input.durationSeconds > 7200)
  ) {
    errors.push("游戏时长应在 0 – 120 分钟之间");
  }
  if (input.startedAt && input.endedAt && !secondsBetween(input.startedAt, input.endedAt)) {
    errors.push("结束时间应晚于开始时间");
  }
  if (input.openingPlan !== undefined && !isOpeningPlan(input.openingPlan)) {
    errors.push(`开局路线取值不合法：${String(input.openingPlan)}`);
  }
  return errors;
}

export function isPlacement(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PLACEMENT;
}

/**
 * 赛果已产生 = 有名次。没有名次的记录是「开局 / 进行中」，不能当成真实赛果
 * 参与平均名次、前四率、吃鸡率或名次趋势。
 */
export const hasResult = (m: { placement?: number }): boolean => isPlacement(m.placement);

export const isWin = (m: { placement?: number }): boolean => m.placement === 1;
export const isTop4 = (m: { placement?: number }): boolean =>
  m.placement !== undefined && m.placement >= 1 && m.placement <= TOP4_PLACEMENT;
export const isBottom4 = (m: { placement?: number }): boolean =>
  m.placement !== undefined && m.placement > TOP4_PLACEMENT && m.placement <= MAX_PLACEMENT;

export function durationOf(m: Match): number | undefined {
  if (m.durationSeconds !== undefined) return m.durationSeconds;
  if (m.startedAt && m.endedAt) return secondsBetween(m.startedAt, m.endedAt);
  return undefined;
}

/** `Match` -> form payload, lists rendered back to text. */
export function matchToInput(match: Match): MatchInput {
  const { id, reviewed, createdAt, updatedAt, ...rest } = match;
  void id;
  void reviewed;
  void createdAt;
  void updatedAt;
  return rest;
}

export function defaultPlayedAt(date = new Date()): string {
  return toWallClock(date);
}

/** UI helper: how to colour a placement. `undefined` = 还没结果，不涂色。 */
export function placementTone(placement?: number): "gold" | "good" | "bad" | "muted" {
  if (placement === undefined) return "muted";
  if (placement === 1) return "gold";
  if (isTop4({ placement })) return "good";
  return "bad";
}

/** UI helper: 有名次写「第 N 名」，没有写「未记录名次」—— 绝不渲染 undefined。 */
export function placementText(placement?: number): string {
  return placement === undefined ? "未记录名次" : `第 ${placement} 名`;
}

export function avgPlacement(values: (number | undefined)[]): number | null {
  const counted = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (counted.length === 0) return null;
  return round(counted.reduce((a, b) => a + b, 0) / counted.length, 2);
}

function listOrUndefined(value: string[] | string | undefined): string[] | undefined {
  // Arrays go through the same splitter as text inputs, so "A / B" and
  // ["A / B"] normalise identically.
  const cleaned = parseList(Array.isArray(value) ? value.join(" / ") : (value ?? ""));
  return cleaned.length ? cleaned : undefined;
}

/** Canonical ids are kept verbatim (no free-text splitting), just tidied. */
function idsOrUndefined(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const cleaned = [...new Set(value.map((v) => v.trim()).filter((v) => v !== ""))];
  return cleaned.length ? cleaned : undefined;
}

function placementOrUndefined(v: number | undefined): number | undefined {
  return v !== undefined && Number.isInteger(v) && v >= 1 && v <= MAX_PLACEMENT ? v : undefined;
}

function positiveOrUndefined(v: number | undefined): number | undefined {
  return v !== undefined && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

function nonNegativeOrUndefined(v: number | undefined): number | undefined {
  return v !== undefined && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}
