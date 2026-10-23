import { validateMatchInput, type MatchInput } from "../../domain/match/match";
import { openingPlanOrUndefined } from "../../domain/match/opening";
import { MISTAKE_TYPE_LIST } from "../../domain/labels";
import { encounterIdOrUndefined } from "../../data/tft/match-links";
import { secondsBetween, toDate, wallClockNow } from "../../lib/wallclock";
import { parseList } from "../../lib/utils";
import type { AdapterResult, DataSourceAdapter } from "./types";

/** Raw shape produced by the match form / Quick Add: strings, nothing parsed. */
export interface ManualMatchPayload {
  /** `YYYY-MM-DDTHH:mm` from a `datetime-local` input; empty means "now". */
  playedAt?: string;
  startedAt?: string;
  endedAt?: string;
  /** Duration entered in minutes. */
  durationMinutes?: string;
  placement?: string | number;
  finalLevel?: string;
  finalHealth?: string;
  totalGold?: string;
  composition?: string;
  traits?: string;
  /** Canonical Set 18 trait ids — the synergies the final board had. */
  traitIds?: string[];
  coreUnits?: string;
  coreItems?: string;
  /** Canonical Set 18 item ids — the items that mattered this game. */
  coreItemIds?: string[];
  augments?: string;
  /** Canonical Set 18 augment ids, in pick order (第一 / 第二 / 第三). */
  augmentIds?: string[];
  /** Training session the match belongs to; empty → active session. */
  sessionId?: string;
  primaryMistake?: string;
  notes?: string;
  /** Structured 复盘 fact, see `OPENING_PLANS`. */
  openingPlan?: string;
  /** Opening encounter id from the active set's encounter catalog. */
  encounterId?: string;
}

function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.+-]/g, ""));
  // 半截输入（"-"、"1.2.3"）会算出 NaN；当作「没填」而不是塞一个 0 进去。
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The single supported source for Phase 1: the player typed it.
 * Turns a loose form payload into a validated `MatchInput`.
 */
export const ManualAdapter: DataSourceAdapter<ManualMatchPayload> = {
  key: "manual",
  label: "手动记录",
  requiresUserInput: true,

  toMatchInput(payload): AdapterResult<MatchInput> {
    const playedAt = payload.playedAt?.trim() || wallClockNow();
    const startedAt = payload.startedAt?.trim() || undefined;
    const endedAt = payload.endedAt?.trim() || undefined;

    const minutes = toNumber(payload.durationMinutes);
    let durationSeconds = minutes !== undefined ? Math.round(minutes * 60) : undefined;
    if (durationSeconds === undefined && startedAt && endedAt) {
      durationSeconds = secondsBetween(startedAt, endedAt);
    }

    const mistakeRaw = payload.primaryMistake?.trim().toUpperCase();
    const primaryMistake = MISTAKE_TYPE_LIST.find((t) => t === mistakeRaw);
    // Both structured facts are validated by their own vocabulary before they
    // reach `validateMatchInput`; an unknown value becomes "not recorded"
    // rather than an error, because neither field is required to save a game.
    const openingPlan = openingPlanOrUndefined(payload.openingPlan);

    const input: MatchInput = {
      playedAt,
      startedAt,
      endedAt,
      durationSeconds,
      // 名次可选：开局 / 进行中还没有结果。留空必须保持「未记录」，
      // 这里曾经写成 `?? 0`，一个 0 会被下游当成一条真实赛果。
      placement: toNumber(payload.placement),
      finalLevel: toNumber(payload.finalLevel),
      finalHealth: toNumber(payload.finalHealth),
      totalGold: toNumber(payload.totalGold),
      composition: payload.composition?.trim() || undefined,
      traits: parseList(payload.traits),
      traitIds: payload.traitIds,
      coreUnits: parseList(payload.coreUnits),
      coreItems: parseList(payload.coreItems),
      coreItemIds: payload.coreItemIds,
      augments: parseList(payload.augments),
      augmentIds: payload.augmentIds,
      sessionId: payload.sessionId?.trim() || undefined,
      primaryMistake,
      notes: payload.notes?.trim() || undefined,
      openingPlan,
      encounterId: encounterIdOrUndefined(payload.encounterId),
    };

    const errors = validateMatchInput(input);
    if (errors.length > 0) return { ok: false, errors };
    if (!toDate(input.playedAt)) return { ok: false, errors: ["对局时间无法解析"] };

    return { ok: true, value: input };
  },
};
