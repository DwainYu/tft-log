import { describe, expect, it } from "vitest";
import {
  SITE_CATEGORIES,
  TFT_SITES,
  getFilteredSites,
  getSiteById,
} from "./tft-sites";

describe("TFT sites catalog (Data Center V2)", () => {
  it("contains exactly the 6 curated sites", () => {
    expect(TFT_SITES).toHaveLength(6);
    const ids = TFT_SITES.map((s) => s.id);
    expect(ids).toEqual([
      "tft-flow",
      "tftraits",
      "little-buddy-bot",
      "tft-academy",
      "tft-clarity",
      "data-tft",
    ]);
  });

  it("has unique non-empty ids", () => {
    const ids = TFT_SITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.trim().length > 0)).toBe(true);
  });

  it("only links secure https URLs", () => {
    for (const site of TFT_SITES) {
      expect(site.url.startsWith("https://")).toBe(true);
    }
  });

  it("contains all required content fields for every site", () => {
    for (const site of TFT_SITES) {
      expect(site.name.trim()).not.toBe("");
      expect(site.shortName.trim()).not.toBe("");
      expect(site.tagline.trim()).not.toBe("");
      expect(site.description.trim()).not.toBe("");
      expect(site.coreFeatures.length).toBeGreaterThanOrEqual(2);
      expect(site.useCases.length).toBeGreaterThanOrEqual(2);
      expect(site.tutorial.length).toBeGreaterThanOrEqual(3);
      expect(site.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(["中文", "英文"]).toContain(site.language);
      expect(["accessible", "slow", "unconfirmed"]).toContain(site.mainlandAccess);
      expect(site.lastVerified).toBe("2026-10-31");
    }
  });

  it("strictly maps every site to a declared category", () => {
    const validCatIds = SITE_CATEGORIES.map((c) => c.id);
    for (const site of TFT_SITES) {
      expect(validCatIds).toContain(site.category);
    }
  });

  it("filters sites accurately by category", () => {
    expect(getFilteredSites("all")).toHaveLength(6);
    expect(getFilteredSites("comps-strategy")).toHaveLength(2);
    expect(getFilteredSites("board-calc")).toHaveLength(1);
    expect(getFilteredSites("mechanics-loot")).toHaveLength(1);
    expect(getFilteredSites("ai-query")).toHaveLength(1);
    expect(getFilteredSites("data-explorer")).toHaveLength(1);
  });

  it("looks up sites by ID", () => {
    expect(getSiteById("tft-flow")?.name).toBe("TFT Flow");
    expect(getSiteById("non-existent")).toBeUndefined();
  });

  it("never claims Little Buddy Bot has a search box or a charm section", () => {
    const site = getSiteById("little-buddy-bot")!;
    const text = [
      site.tagline,
      site.description,
      ...site.coreFeatures,
      ...site.useCases,
      ...site.tutorial.flatMap((step) => [step.title, step.detail]),
      ...site.recommendations,
      site.accessNote,
    ].join("\n");

    expect(text).not.toMatch(/法杖|Charms|charms/);
    expect(text).not.toMatch(/支持(站内)?搜索|利用搜索|按分类筛选/);
    expect(text).toMatch(/Loot orb contents/);
    expect(text).toMatch(/Trait Ladder/);
  });

  it("describes DataTFT Explorer with the real query flow, not fake categories", () => {
    const site = getSiteById("data-tft")!;
    const steps = site.tutorial.map((step) => step.detail).join("\n");

    expect(steps).not.toMatch(/点击选择「棋子」、「羁绊」、「装备」或「强化符文」/);
    expect(steps).toMatch(/关键字/);
    expect(steps).toMatch(/排除条件/);
    expect(steps).toMatch(/最小(数据)?样本/);
    expect(steps).toMatch(/前四率/);
  });

  it("attributes DPS and tank math to TFTraits calculators instead of the board planner", () => {
    const site = getSiteById("tftraits")!;
    const text = [
      site.description,
      ...site.coreFeatures,
      ...site.tutorial.map((s) => s.detail),
      ...site.recommendations,
    ].join("\n");

    expect(text).toMatch(/DPS Calculator/);
    expect(text).toMatch(/Tank Calculator/);
    expect(text).toMatch(/Board Planner/);
    expect(text).toMatch(/100% 准确/);
  });

  it("lists the full TFT Academy tier scale including situational X", () => {
    const site = getSiteById("tft-academy")!;
    const text = [...site.coreFeatures, ...site.tutorial.map((s) => s.detail)].join("\n");

    expect(text).toMatch(/S \/ A \/ B \/ C \/ X/);
    expect(text).toMatch(/Situational/);
    expect(text).not.toMatch(/避坑项/);
  });

  it("documents the TFT Flow subscription gate", () => {
    const site = getSiteById("tft-flow")!;
    const text = [...site.recommendations, ...site.tutorial.map((s) => s.detail)].join("\n");

    expect(text).toMatch(/Patreon/);
    expect(text).toMatch(/Twitch/);
    expect(text).toMatch(/Demo/);
  });

  it("states TFTClarity dropped Set 17 support without claiming version lag", () => {
    const site = getSiteById("tft-clarity")!;
    const text = [
      site.tagline,
      site.description,
      ...site.coreFeatures,
      ...site.tutorial.map((s) => s.detail),
      ...site.recommendations,
      site.accessNote,
    ].join("\n");

    // the user-confirmed fact: Set 17 support was dropped, not "outdated"
    expect(text).toMatch(/已停止对 Set 17 数据的支持/);
    expect(text).toMatch(/以网站当前实际提供的赛季和数据为准/);
    // no false "version lag" claims
    expect(text).not.toMatch(/滞后|落后|仅支持 Set 17|版本延迟/);
    // AI verification reminder must survive the version-note rewrite
    expect(text).toMatch(/切勿将 AI 回答当作绝对真理/);
    expect(site.accessNote).toMatch(/中英双语/);
  });
});

