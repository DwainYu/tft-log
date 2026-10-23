import { describe, expect, it } from "vitest";
import { normalizeCompositionKey, summarizeCompositionUsage } from "./composition";

describe("normalizeCompositionKey", () => {
  it("is the identity for a clean name", () => {
    expect(normalizeCompositionKey("福牛")).toBe("福牛");
    expect(normalizeCompositionKey("Arcader")).toBe("Arcader");
  });

  it("trims whitespace on both sides", () => {
    expect(normalizeCompositionKey("福牛 ")).toBe("福牛");
    expect(normalizeCompositionKey(" 福牛")).toBe("福牛");
    expect(normalizeCompositionKey("  福牛  ")).toBe("福牛");
    expect(normalizeCompositionKey("\t福牛\n")).toBe("福牛");
  });

  it("collapses whitespace runs inside the name", () => {
    expect(normalizeCompositionKey("福牛  战神")).toBe("福牛 战神");
    expect(normalizeCompositionKey("Arcader\n\t gold")).toBe("Arcader gold");
    expect(normalizeCompositionKey("福牛　战神")).toBe("福牛 战神"); // full-width space
  });

  it("returns an empty string for empty or blank input", () => {
    expect(normalizeCompositionKey("")).toBe("");
    expect(normalizeCompositionKey("   ")).toBe("");
    expect(normalizeCompositionKey(undefined)).toBe("");
  });

  it("keeps case and punctuation — no fuzzy matching", () => {
    expect(normalizeCompositionKey("Rebel")).not.toBe(normalizeCompositionKey("rebel"));
    expect(normalizeCompositionKey("枪手")).not.toBe(normalizeCompositionKey("枪 手"));
  });

  it("is stable: normalizing twice changes nothing", () => {
    const once = normalizeCompositionKey(" 福牛  战神 ");
    expect(normalizeCompositionKey(once)).toBe(once);
  });
});

describe("summarizeCompositionUsage", () => {
  // 使用统计只认已结算的局（见 summarize 的过滤），fixture 默认带名次
  const m = (composition: string | undefined, playedAt: string, placement = 3) => ({
    composition,
    playedAt,
    placement,
  });

  it("counts one row per normalized key", () => {
    const rows = summarizeCompositionUsage([
      m("福牛", "2026-02-01T13:00"),
      m("福牛 ", "2026-02-02T13:00"),
      m(" 福牛", "2026-02-03T13:00"),
      m("Rebel", "2026-02-03T18:00"),
    ]);
    const byKey = new Map(rows.map((r) => [r.compositionKey, r]));
    expect(byKey.size).toBe(2);
    expect(byKey.get("福牛")?.usageCount).toBe(3);
    expect(byKey.get("Rebel")?.usageCount).toBe(1);
  });

  it("skips missing and blank compositions", () => {
    expect(summarizeCompositionUsage([m(undefined, "2026-02-01T13:00"), m("   ", "2026-02-01T13:00")])).toEqual([]);
  });

  it("skips matches without a result — 开局的计划阵容不算使用过", () => {
    const rows = summarizeCompositionUsage([
      { composition: "法师", playedAt: "2026-02-01T13:00", placement: undefined }, // 开局就建，还没结算
      m("法师", "2026-02-02T14:00"), // 已结算
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].usageCount).toBe(1);
  });

  it("spans first and last usage from playedAt", () => {
    const rows = summarizeCompositionUsage([
      m("福牛", "2026-02-03T13:00"),
      m("福牛", "2026-02-01T09:00"),
      m("福牛", "2026-02-02T20:00"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].usageCount).toBe(3);
    expect(rows[0].firstUsedAt < rows[0].lastUsedAt).toBe(true);
  });

  it("is idempotent — summarizing twice never doubles counts", () => {
    const matches = [m("福牛", "2026-02-01T13:00"), m("福牛", "2026-02-02T13:00")];
    const first = summarizeCompositionUsage(matches);
    const second = summarizeCompositionUsage(matches);
    expect(second).toEqual(first);
    expect(second[0].usageCount).toBe(2);
  });

  it("falls back to now when playedAt is not a real instant", () => {
    const rows = summarizeCompositionUsage([m("福牛", "not-a-date")], "2026-02-01T00:00:00.000Z");
    expect(rows[0].firstUsedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("returns nothing for an empty history", () => {
    expect(summarizeCompositionUsage([])).toEqual([]);
  });
});
