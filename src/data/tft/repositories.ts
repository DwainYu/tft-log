import { getActiveSetData } from "./registry";
import type { AugmentData, ChampionData, EncounterData, ItemData, TraitData } from "./types";

/**
 * Read-only lookup API over the active set's static data. This is the layer
 * the domain and UI code use — nothing imports the JSON files directly.
 *
 * Data is static and small, so indexes are built once at module load.
 */
export interface ChampionRepository {
  getChampions(): ChampionData[];
  getChampionById(id: string): ChampionData | undefined;
  getChampionsByCost(cost: number): ChampionData[];
  getChampionsByTrait(traitId: string): ChampionData[];
  /** Case-insensitive name / id search for pickers and autocomplete. */
  searchChampions(query: string): ChampionData[];
}

export interface TraitRepository {
  getTraits(): TraitData[];
  getTraitById(id: string): TraitData | undefined;
  getTraitBreakpoints(id: string): number[] | undefined;
}

export interface ItemRepository {
  getItems(): ItemData[];
  getItemById(id: string): ItemData | undefined;
  getItemsByCategory(category: ItemData["category"]): ItemData[];
  searchItems(query: string): ItemData[];
}

export interface AugmentRepository {
  getAugments(): AugmentData[];
  getAugmentById(id: string): AugmentData | undefined;
  searchAugments(query: string): AugmentData[];
}

/**
 * Opening encounters for the active set.
 *
 * May legitimately be empty: a future set with no published encounter table
 * simply has nothing to offer, and callers must fall back to "not recorded"
 * rather than inventing options.
 */
export interface EncounterRepository {
  getEncounters(): EncounterData[];
  getEncounterById(id: string): EncounterData | undefined;
  /** The single "nothing happened" outcome, when the catalog defines one. */
  getNoneEncounter(): EncounterData | undefined;
  searchEncounters(query: string): EncounterData[];
}

const data = getActiveSetData();

const championById = new Map(data.champions.map((c) => [c.id, c]));
const traitById = new Map(data.traits.map((t) => [t.id, t]));
const itemById = new Map(data.items.map((i) => [i.id, i]));
const augmentById = new Map(data.augments.map((a) => [a.id, a]));
const encounterById = new Map((data.encounters ?? []).map((e) => [e.id, e]));
const noneEncounter = (data.encounters ?? []).find((e) => e.isNone);

const byCost = new Map<number, ChampionData[]>();
for (const c of data.champions) byCost.set(c.cost, [...(byCost.get(c.cost) ?? []), c]);

const byTrait = new Map<string, ChampionData[]>();
for (const c of data.champions) {
  for (const t of c.traits) byTrait.set(t, [...(byTrait.get(t) ?? []), c]);
}

const byCategory = new Map<string, ItemData[]>();
for (const i of data.items) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);

function matchQuery(query: string, name: string, id: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
}

export const championRepository: ChampionRepository = {
  getChampions: () => data.champions,
  getChampionById: (id) => championById.get(id),
  getChampionsByCost: (cost) => byCost.get(cost) ?? [],
  getChampionsByTrait: (traitId) => byTrait.get(traitId) ?? [],
  searchChampions: (query) => data.champions.filter((c) => matchQuery(query, c.name, c.id)),
};

export const traitRepository: TraitRepository = {
  getTraits: () => data.traits,
  getTraitById: (id) => traitById.get(id),
  getTraitBreakpoints: (id) => traitById.get(id)?.breakpoints,
};

export const itemRepository: ItemRepository = {
  getItems: () => data.items,
  getItemById: (id) => itemById.get(id),
  getItemsByCategory: (category) => byCategory.get(category) ?? [],
  searchItems: (query) => data.items.filter((i) => matchQuery(query, i.name, i.id)),
};

export const augmentRepository: AugmentRepository = {
  getAugments: () => data.augments,
  getAugmentById: (id) => augmentById.get(id),
  searchAugments: (query) => data.augments.filter((a) => matchQuery(query, a.name, a.id)),
};

export const encounterRepository: EncounterRepository = {
  getEncounters: () => data.encounters ?? [],
  getEncounterById: (id) => encounterById.get(id),
  getNoneEncounter: () => noneEncounter,
  searchEncounters: (query) =>
    (data.encounters ?? []).filter(
      (e) => matchQuery(query, e.name, e.id) || e.englishName.toLowerCase().includes(query.trim().toLowerCase()),
    ),
};
