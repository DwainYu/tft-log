import { describe, expect, it } from "vitest";
import { set18Data } from "./set18";
import { getActiveSetDefinition, getSetData } from "./registry";
import {
  augmentRepository,
  championRepository,
  itemRepository,
  traitRepository,
} from "./repositories";
import { ITEM_CATEGORIES, type TftDataSnapshot } from "./types";
import { validateDataset } from "./validation";

describe("set 18 manifest", () => {
  const m = set18Data.manifest;

  it("answers every provenance question", () => {
    expect(m.set).toBe(18);
    expect(m.version).toBe("18.3");
    expect(m.schemaVersion).toBe(1);
    expect(m.dataVersion).toMatch(/^s18/);
    expect(m.source.url).toMatch(/communitydragon\.org/);
    expect(m.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("counts match the actual arrays", () => {
    expect(m.counts?.champions).toBe(set18Data.champions.length);
    expect(m.counts?.traits).toBe(set18Data.traits.length);
    expect(m.counts?.items).toBe(set18Data.items.length);
    expect(m.counts?.augments).toBe(set18Data.augments.length);
  });
});

describe("set 18 dataset integrity", () => {
  it("passes its own schema + cross-reference validation", () => {
    expect(validateDataset(set18Data)).toEqual([]);
  });

  it("ships a complete, non-fabricated shape", () => {
    expect(set18Data.champions).toHaveLength(65);
    expect(set18Data.traits).toHaveLength(36);
    expect(set18Data.items.length).toBeGreaterThan(100);
    expect(set18Data.augments.length).toBeGreaterThan(500);
  });
});

describe("champion lookups", () => {
  it("finds a champion by its stable apiName id", () => {
    const azir = championRepository.getChampionById("DA_18_Azir");
    expect(azir?.name).toBe("阿兹尔");
    expect(azir?.cost).toBe(3);
    expect(azir?.traits).toContain("DA_18_Executioner");
    expect(azir?.stats?.hp).toBeGreaterThan(0);
  });

  it("lists champions by cost", () => {
    expect(championRepository.getChampionsByCost(1)).toHaveLength(14);
    expect(championRepository.getChampionsByCost(5)).toHaveLength(10);
    expect(championRepository.getChampionsByCost(9)).toEqual([]);
  });

  it("lists champions by trait", () => {
    const spellweavers = championRepository.getChampionsByTrait("DA_18_Spellweaver");
    expect(spellweavers.length).toBeGreaterThan(0);
    for (const c of spellweavers) expect(c.traits).toContain("DA_18_Spellweaver");
  });

  it("searches by name and returns nothing for an unknown id", () => {
    expect(championRepository.searchChampions("阿兹尔")).toHaveLength(1);
    expect(championRepository.getChampionById("DA_18_NotACampion")).toBeUndefined();
  });
});

describe("trait lookups", () => {
  it("finds a trait with its published breakpoints", () => {
    const rapidfire = traitRepository.getTraitById("DA_18_Rapidfire");
    expect(rapidfire?.name).toBe("迅捷射手");
    expect(traitRepository.getTraitBreakpoints("DA_18_Rapidfire")).toEqual([2, 3, 4, 5]);
    expect(traitRepository.getTraitBreakpoints("DA_18_NotATrait")).toBeUndefined();
  });
});

describe("item lookups", () => {
  it("finds a completed item with resolvable composition", () => {
    const staff = itemRepository.getItemById("TFT_Item_ArchangelsStaff");
    expect(staff?.name).toBe("大天使之杖");
    expect(staff?.category).toBe("completed");
    expect(staff?.composition).toEqual([
      "TFT_Item_NeedlesslyLargeRod",
      "TFT_Item_TearOfTheGoddess",
    ]);
    expect(itemRepository.getItemById("TFT_Item_Unknown")).toBeUndefined();
  });

  it("classifies every item into a known category", () => {
    for (const item of itemRepository.getItems()) {
      expect(ITEM_CATEGORIES).toContain(item.category);
    }
  });

  it("finds radiant and emblem families", () => {
    expect(itemRepository.getItemsByCategory("radiant").length).toBeGreaterThan(30);
    expect(itemRepository.getItemsByCategory("emblem").length).toBeGreaterThan(0);
    // 光明版大天使之杖 also contains the name — substring search is the contract.
    expect(itemRepository.searchItems("大天使之杖").some((i) => i.id === "TFT_Item_ArchangelsStaff")).toBe(true);
  });
});

describe("augment lookups", () => {
  it("finds an augment by id", () => {
    expect(augmentRepository.getAugmentById("DA_18_BigGrabBag")?.name).toBe("大百宝袋");
    expect(augmentRepository.getAugmentById("DA_18_NotAnAugment")).toBeUndefined();
    expect(augmentRepository.searchAugments("百宝袋").some((a) => a.id === "DA_18_BigGrabBag")).toBe(true);
  });
});

describe("set registry", () => {
  it("exposes set 18 as the active set", () => {
    const def = getActiveSetDefinition();
    expect(def.id).toBe("set18");
    expect(def.active).toBe(true);
    expect(getSetData().manifest.set).toBe(18);
  });

  it("rejects unknown sets", () => {
    expect(() => getSetData("set99")).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* validator behaviour against deliberately broken fixtures           */
/* ------------------------------------------------------------------ */

function validFixture(): TftDataSnapshot {
  return {
    manifest: {
      set: 18,
      name: "Set 18: Enchanted Wilds",
      version: "18.3",
      locale: "zh-CN",
      schemaVersion: 1,
      dataVersion: "fixture",
      source: {
        name: "fixture",
        url: "https://example.org/data.json",
        sha256: "0".repeat(64),
        retrievedAt: "2026-09-24",
        notes: [],
      },
      generatedAt: "2026-09-24",
      counts: { champions: 1, traits: 1, items: 2, augments: 1 },
    },
    champions: [
      { id: "c1", name: "甲", cost: 1, traits: ["t1"], set: 18 },
    ],
    traits: [{ id: "t1", name: "羁绊", set: 18, breakpoints: [2, 4], description: "" }],
    items: [
      { id: "i1", name: "金锅锅", category: "component", set: 18, description: "" },
      {
        id: "i2",
        name: "大天使之杖",
        category: "completed",
        set: 18,
        description: "",
        composition: ["i1", "i1"],
      },
    ],
    augments: [{ id: "a1", name: "大百宝袋", set: 18, description: "" }],
    encounters: [
      { id: "e1", name: "纹章合奏", englishName: "Emblem Ensemble", description: "开局获得 3 个随机纹章。", set: 18, championId: "c1", isNone: false },
      { id: "e-none", name: "无开局事件", englishName: "No Encounter", description: "本局没有开局事件。", set: 18, isNone: true },
    ],
  };
}

describe("validateDataset (broken fixtures)", () => {
  it("accepts a minimal valid snapshot", () => {
    expect(validateDataset(validFixture())).toEqual([]);
  });

  it("flags duplicate champion ids", () => {
    const d = validFixture();
    d.champions.push({ ...d.champions[0] });
    expect(validateDataset(d)).toContain(`champion: duplicate id "c1"`);
  });

  it("flags duplicate trait / item / augment ids", () => {
    const a = validFixture();
    a.traits.push({ ...a.traits[0] });
    expect(validateDataset(a)).toContain(`trait: duplicate id "t1"`);

    const b = validFixture();
    b.items.push({ ...b.items[0] });
    expect(validateDataset(b)).toContain(`item: duplicate id "i1"`);

    const c = validFixture();
    c.augments.push({ ...c.augments[0] });
    expect(validateDataset(c)).toContain(`augment: duplicate id "a1"`);
  });

  it("flags empty names", () => {
    const d = validFixture();
    d.champions[0].name = "  ";
    expect(validateDataset(d)).toContain(`champion c1: empty name`);
  });

  it("flags invalid champion cost and set mismatch", () => {
    const d = validFixture();
    d.champions[0].cost = 0 as never;
    d.champions[0].set = 19;
    const errors = validateDataset(d);
    expect(errors).toContain(`champion c1: invalid cost 0`);
    expect(errors).toContain(`champion c1: set 19 != manifest set 18`);
  });

  it("flags an unknown item category", () => {
    const d = validFixture();
    d.items[0].category = "mystery" as never;
    expect(validateDataset(d)).toContain(`item i1: unknown category "mystery"`);
  });

  it("flags cross-reference problems", () => {
    const d = validFixture();
    d.champions[0].traits = ["t-nope"];
    d.items[1].composition = ["i1", "i-missing"];
    const errors = validateDataset(d);
    expect(errors).toContain(`champion c1: unknown trait "t-nope"`);
    expect(errors).toContain(`item i2: composition references unknown item "i-missing"`);
  });

  it("flags manifest shape problems", () => {
    const d = validFixture();
    d.manifest.version = " ";
    d.manifest.source.sha256 = "";
    d.manifest.counts!.champions = 42;
    const errors = validateDataset(d);
    expect(errors).toContain("manifest: version must be a non-empty string");
    expect(errors).toContain("manifest.source: sha256 must be a non-empty string");
    expect(errors).toContain("manifest.counts.champions (42) != actual (1)");
  });
});
