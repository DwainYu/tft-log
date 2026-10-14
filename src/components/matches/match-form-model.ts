import type { ManualMatchPayload } from "../../data/adapters/manual-adapter";
import type { Match } from "../../domain/types";
import { DAILY_SESSION_ID } from "../../domain/types";
import { formatList } from "../../lib/utils";
import { hourOf, minuteOf } from "../../lib/wallclock";
import { augmentIdByName, augmentOptions } from "../../services/augment-service";
import { itemIdByName, itemOptions } from "../../services/item-service";
import { traitIdByName, traitOptions } from "../../services/trait-service";

/**
 * The form is deliberately date + two clock fields (not one datetime each):
 * that is how a player remembers a game — "今天中午那把，12:10 打到 12:45".
 */
export interface MatchFormDraft {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: string;
  placement: number | undefined;
  finalLevel: string;
  finalHealth: string;
  totalGold: string;
  composition: string;
  /** Canonical trait ids — the synergies the final board had, unordered. */
  traitIds: string[];
  /** Typed trait entries from older records that the snapshot cannot resolve. */
  traitsLegacy: string[];
  coreUnits: string;
  /** Canonical item ids — "what mattered this game", unordered, no unit link. */
  coreItemIds: string[];
  /**
   * Free-text item entries from older records that the static snapshot cannot
   * resolve ("无尽", "蓝buff"). Kept verbatim so editing never loses them.
   */
  coreItemsLegacy: string[];
  /**
   * Canonical augment ids in pick order. The free-text `augments` field stays
   * the display/search fallback the rest of the app already reads, and is
   * derived from these ids on save.
   */
  augmentIds: string[];
  /**
   * Typed augment names from older records that the snapshot cannot resolve.
   * They are *not* canonical picks and so do not occupy one of the three
   * in-game slots (see AugmentSelector): they are kept verbatim so that
   * editing and re-saving a legacy record cannot destroy them.
   */
  augmentsLegacy: string[];
  primaryMistake: string;
  notes: string;
  /** Training session this match belongs to (defaults to the active one). */
  sessionId: string;
  /** Structured opening route; `""` = not marked. See `OPENING_PLANS`. */
  openingPlan: string;
  /**
   * Opening encounter id from the active set catalog.
   * `""` = not recorded yet (distinct from the catalog's "no encounter" id,
   * which means the game genuinely had none).
   */
  encounterId: string;
}

/**
 * Ids win; typed text is only used to recover ids the record never had.
 * Anything that cannot be resolved is handed back as legacy text rather than
 * being dropped — old records store shorthand ("无尽", "蓝buff") that the
 * official snapshot simply does not contain.
 *
 * The rule is identical for all three pickers, so it lives here once.
 */
function splitByIds(
  ids: string[] | undefined,
  texts: string[] | undefined,
  idByName: (name: string) => string | undefined,
): { ids: string[]; legacy: string[] } {
  const resolved = [...(ids ?? [])];
  const known = new Set(resolved);
  const legacy: string[] = [];
  for (const text of texts ?? []) {
    const id = idByName(text);
    if (!id) legacy.push(text);
    else if (!known.has(id)) {
      resolved.push(id);
      known.add(id);
    }
  }
  return { ids: resolved, legacy };
}

export function splitCoreItems(
  ids: string[] | undefined,
  texts: string[] | undefined,
): { coreItemIds: string[]; coreItemsLegacy: string[] } {
  const { ids: coreItemIds, legacy: coreItemsLegacy } = splitByIds(ids, texts, itemIdByName);
  return { coreItemIds, coreItemsLegacy };
}

/** Same rule as items: ids win, typed text fills gaps, leftovers are kept. */
export function splitTraits(
  ids: string[] | undefined,
  texts: string[] | undefined,
): { traitIds: string[]; traitsLegacy: string[] } {
  const { ids: traitIds, legacy: traitsLegacy } = splitByIds(ids, texts, traitIdByName);
  return { traitIds, traitsLegacy };
}

/**
 * Augments follow the very same rule. This used to be a bare
 * `.map(augmentIdByName).filter(Boolean)`, which silently threw away any
 * typed name the snapshot cannot resolve — pressing 保存 then destroyed it.
 */
export function splitAugments(
  ids: string[] | undefined,
  texts: string[] | undefined,
): { augmentIds: string[]; augmentsLegacy: string[] } {
  const { ids: augmentIds, legacy: augmentsLegacy } = splitByIds(ids, texts, augmentIdByName);
  return { augmentIds, augmentsLegacy };
}

const pad = (n: number) => n.toString().padStart(2, "0");
export const timeText = (value: string): string => {
  const h = hourOf(value);
  if (h === null) return "";
  return `${pad(h)}:${pad(minuteOf(value) ?? 0)}`;
};

export function emptyDraft(date = new Date(), sessionId = DAILY_SESSION_ID): MatchFormDraft {
  const p = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`,
    startTime: "",
    endTime: "",
    durationMinutes: "",
    placement: undefined,
    finalLevel: "",
    finalHealth: "",
    totalGold: "",
    composition: "",
    traitIds: [],
    traitsLegacy: [],
    coreUnits: "",
    coreItemIds: [],
    coreItemsLegacy: [],
    augmentIds: [],
    augmentsLegacy: [],
    primaryMistake: "",
    notes: "",
    sessionId,
    openingPlan: "",
    encounterId: "",
  };
}

export function draftFromMatch(
  match: Match,
  fallbackSessionId = DAILY_SESSION_ID,
): MatchFormDraft {
  return {
    date: match.playedAt.slice(0, 10),
    startTime: timeText(match.startedAt ?? ""),
    endTime: timeText(match.endedAt ?? match.playedAt),
    durationMinutes:
      match.durationSeconds !== undefined ? String(Math.round(match.durationSeconds / 60)) : "",
    placement: match.placement,
    finalLevel: match.finalLevel !== undefined ? String(match.finalLevel) : "",
    finalHealth: match.finalHealth !== undefined ? String(match.finalHealth) : "",
    totalGold: match.totalGold !== undefined ? String(match.totalGold) : "",
    composition: match.composition ?? "",
    ...splitTraits(match.traitIds, match.traits),
    coreUnits: formatList(match.coreUnits),
    ...splitCoreItems(match.coreItemIds, match.coreItems),
    // records written before the picker only have names; look the ids up so
    // editing an old game still shows what was played. Anything that cannot
    // be resolved stays as legacy text instead of being dropped on save.
    ...splitAugments(match.augmentIds, match.augments),
    primaryMistake: match.primaryMistake ?? "",
    notes: match.notes ?? "",
    sessionId: match.sessionId ?? fallbackSessionId,
    openingPlan: match.openingPlan ?? "",
    encounterId: match.encounterId ?? "",
  };
}

export type MatchFormPayload = ManualMatchPayload & { playedAt: string };

export function draftToPayload(draft: MatchFormDraft): MatchFormPayload {
  const { date, startTime, endTime } = draft;
  const startedAt = startTime ? `${date}T${startTime}` : "";
  const endedAt = endTime ? `${date}T${endTime}` : "";
  // playedAt is the timestamp every list/sort/filter uses: prefer the end of
  // the game, fall back to its start, then to the date alone.
  const playedAt = endedAt || startedAt || date;
  return {
    playedAt,
    startedAt: startedAt || undefined,
    endedAt: endedAt || undefined,
    durationMinutes: draft.durationMinutes,
    placement: draft.placement === undefined ? "" : String(draft.placement),
    finalLevel: draft.finalLevel,
    finalHealth: draft.finalHealth,
    totalGold: draft.totalGold,
    composition: draft.composition,
    traits: [...draft.traitsLegacy, ...traitOptions(draft.traitIds).map((t) => t.name)].join(" / "),
    traitIds: draft.traitIds,
    coreUnits: draft.coreUnits,
    // legacy shorthand first, then the names the ids resolve to: detail pages,
    // search and CSV all still read this free-text field
    coreItems: [...draft.coreItemsLegacy, ...itemOptions(draft.coreItemIds).map((i) => i.name)].join(
      " / ",
    ),
    coreItemIds: draft.coreItemIds,
    // names are derived, never typed: detail pages, search and CSV all still
    // read the free-text field the picker now fills in. Legacy shorthand the
    // snapshot cannot resolve is re-emitted verbatim so it survives the round
    // trip; it leads because it is not an in-game pick order. On a legacy
    // record's first save that lead flips this display-only string once
    // (["大百宝袋","不存在…"] → ["不存在…","大百宝袋"]); it is idempotent from
    // pass 1 on and nothing reads the order, so it is left alone.
    augments: [...draft.augmentsLegacy, ...augmentOptions(draft.augmentIds).map((a) => a.name)].join(
      " / ",
    ),
    augmentIds: draft.augmentIds,
    primaryMistake: draft.primaryMistake,
    notes: draft.notes,
    sessionId: draft.sessionId || undefined,
    openingPlan: draft.openingPlan,
    encounterId: draft.encounterId,
  };
}

/** Duration shown while typing: explicit value wins, else derived from the clocks. */
export function effectiveDurationMinutes(draft: MatchFormDraft): string {
  if (draft.durationMinutes.trim()) return draft.durationMinutes.trim();
  if (!draft.startTime || !draft.endTime) return "";
  const [sh, sm] = draft.startTime.split(":").map(Number);
  const [eh, em] = draft.endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return "";
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? String(diff) : "";
}
