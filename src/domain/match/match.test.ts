import { describe, expect, it } from "vitest";
import {
  applyMatchInput,
  createMatch,
  isBottom4,
  isTop4,
  isWin,
  matchToInput,
  validateMatchInput,
  type MatchInput,
} from "./match";
import { MAX_PLACEMENT } from "../types";

const base: MatchInput = {
  playedAt: "2026-02-05T13:30",
  placement: 4,
};

describe("createMatch", () => {
  it("fills ids and timestamps", () => {
    const m = createMatch(base);
    expect(m.id).toBeTruthy();
    expect(m.reviewed).toBe(false);
    expect(m.createdAt).toMatch(/^\d{4}-/);
    expect(m.updatedAt).toBe(m.createdAt);
  });

  it("derives duration from start/end when not given", () => {
    const m = createMatch({
      ...base,
      startedAt: "2026-02-05T12:50",
      endedAt: "2026-02-05T13:20",
    });
    expect(m.durationSeconds).toBe(1800);
  });

  it("keeps an explicit duration over the derived one", () => {
    const m = createMatch({
      ...base,
      startedAt: "2026-02-05T12:50",
      endedAt: "2026-02-05T13:20",
      durationSeconds: 1500,
    });
    expect(m.durationSeconds).toBe(1500);
  });

  it("drops empty optional fields instead of storing blanks", () => {
    const m = createMatch({
      ...base,
      composition: "   ",
      coreUnits: ["", "  A ", "B/", ""],
      notes: "",
    });
    expect(m.composition).toBeUndefined();
    expect(m.notes).toBeUndefined();
    expect(m.coreUnits).toEqual(["A", "B"]);
    expect("totalGold" in m).toBe(false);
  });

  it("applies later input without touching created/placement history", () => {
    const m = createMatch(base);
    const next = applyMatchInput(m, { ...base, placement: 1, composition: "Fortune" });
    expect(next.id).toBe(m.id);
    expect(next.createdAt).toBe(m.createdAt);
    expect(next.placement).toBe(1);
    expect(next.composition).toBe("Fortune");
  });

  it("stores no placement key at all when the game has no result yet", () => {
    const { placement: _omitted, ...unfinished } = base;
    const m = createMatch({ ...unfinished, composition: "Arcader" });
    expect(m.placement).toBeUndefined();
    // not 0 — 0 would enter 平均名次 / 前四率 as a real result
    expect("placement" in m).toBe(false);
  });

  it("keeps the structured opening plan when the match is edited again", () => {
    const m = { ...createMatch(base), openingPlan: "FORCE" as const };
    expect(applyMatchInput(m, { ...base, placement: 2 }).openingPlan).toBe("FORCE");
    expect(matchToInput(m).openingPlan).toBe("FORCE");
  });
});

describe("placement predicates", () => {
  it("classifies top4 / bottom4 / win", () => {
    expect(isWin({ placement: 1 })).toBe(true);
    expect(isWin({ placement: 2 })).toBe(false);
    expect(isTop4({ placement: 4 })).toBe(true);
    expect(isTop4({ placement: 5 })).toBe(false);
    expect(isBottom4({ placement: 5 })).toBe(true);
    expect(isBottom4({ placement: 4 })).toBe(false);
  });
});

describe("validateMatchInput", () => {
  it("accepts a minimal valid record", () => {
    expect(validateMatchInput(base)).toEqual([]);
  });

  it("rejects placements outside 1-8", () => {
    expect(validateMatchInput({ ...base, placement: 0 }).length).toBeGreaterThan(0);
    expect(validateMatchInput({ ...base, placement: MAX_PLACEMENT + 1 }).length).toBeGreaterThan(0);
    expect(validateMatchInput({ ...base, placement: 3.5 }).length).toBeGreaterThan(0);
  });

  it("names the placement error so the form can point at the field", () => {
    expect(validateMatchInput({ ...base, placement: 0 })).toContain(
      `名次必须是 1 – ${MAX_PLACEMENT} 的整数`,
    );
    expect(validateMatchInput({ ...base, placement: MAX_PLACEMENT + 1 })).toContain(
      `名次必须是 1 – ${MAX_PLACEMENT} 的整数`,
    );
    // a non-integer is "filled in but wrong" too, never "unknown"
    expect(validateMatchInput({ ...base, placement: 3.5 })).toContain(
      `名次必须是 1 – ${MAX_PLACEMENT} 的整数`,
    );
  });

  it("accepts a record with no placement: the game has no result yet", () => {
    // absent placement = 开局 / 进行中. 0 is not a stand-in for it.
    const { placement: _omitted, ...unfinished } = base;
    expect(validateMatchInput(unfinished)).toEqual([]);
    expect(validateMatchInput({ playedAt: base.playedAt })).toEqual([]);
  });

  it("still rejects 0 and 9 — neither means 'unknown'", () => {
    expect(validateMatchInput({ ...base, placement: 0 })).toContain(
      `名次必须是 1 – ${MAX_PLACEMENT} 的整数`,
    );
    expect(validateMatchInput({ ...base, placement: 9 })).toContain(
      `名次必须是 1 – ${MAX_PLACEMENT} 的整数`,
    );
    expect(validateMatchInput({ ...base, placement: 2.5 })).toContain(
      `名次必须是 1 – ${MAX_PLACEMENT} 的整数`,
    );
    // but leaving it out is always valid
    const { placement: _omitted, ...unfinished } = base;
    expect(validateMatchInput(unfinished)).toEqual([]);
  });

  it("rejects an unparsable playedAt", () => {
    expect(validateMatchInput({ ...base, playedAt: "昨天下午" }).length).toBeGreaterThan(0);
  });

  it("rejects end before start", () => {
    const errors = validateMatchInput({
      ...base,
      startedAt: "2026-02-05T13:40",
      endedAt: "2026-02-05T13:20",
    });
    expect(errors).toContain("结束时间应晚于开始时间");
  });

  it("rejects out-of-range level / health", () => {
    expect(validateMatchInput({ ...base, finalLevel: 30 })).toContain("最终等级应在 1 – 12 之间");
    expect(validateMatchInput({ ...base, finalHealth: 120 })).toContain(
      "结束时剩余血量应为 0 – 100 的数字",
    );
    // a negative or non-finite health is the same mistake, said once
    expect(validateMatchInput({ ...base, finalHealth: -1 })).toContain(
      "结束时剩余血量应为 0 – 100 的数字",
    );
    expect(validateMatchInput({ ...base, finalHealth: Number.NaN })).toContain(
      "结束时剩余血量应为 0 – 100 的数字",
    );
  });
});

describe("canonical static-data ids (Phase 2)", () => {
  it("normalises id lists: trim, drop empties, dedupe", () => {
    const m = createMatch({
      ...base,
      set: 18,
      traitIds: ["DA_18_Spellweaver", "DA_18_Spellweaver", " ", "DA_18_Rapidfire"],
      coreUnitIds: ["DA_18_Azir"],
      coreItemIds: ["TFT_Item_ArchangelsStaff"],
      augmentIds: ["DA_18_BigGrabBag"],
    });
    expect(m.set).toBe(18);
    expect(m.traitIds).toEqual(["DA_18_Spellweaver", "DA_18_Rapidfire"]);
    expect(m.coreUnitIds).toEqual(["DA_18_Azir"]);
    expect(m.coreItemIds).toEqual(["TFT_Item_ArchangelsStaff"]);
    expect(m.augmentIds).toEqual(["DA_18_BigGrabBag"]);
  });

  it("keeps legacy records without ids intact (backward compatibility)", () => {
    const m = createMatch({ ...base, composition: "法师爆发", traits: ["法师"] });
    expect("traitIds" in m).toBe(false);
    expect("coreUnitIds" in m).toBe(false);
    expect("set" in m).toBe(false);
    expect(m.composition).toBe("法师爆发");
    expect(validateMatchInput(matchToInput(m))).toEqual([]);
  });

  it("drops empty id arrays instead of storing them", () => {
    const m = createMatch({ ...base, traitIds: ["", "  "] });
    expect("traitIds" in m).toBe(false);
  });
});
