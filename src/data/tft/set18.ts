import championsJson from "../../../data/tft/set18/champions.json";
import augmentsJson from "../../../data/tft/set18/augments.json";
import encountersJson from "../../../data/tft/set18/encounters.json";
import itemsJson from "../../../data/tft/set18/items.json";
import manifestJson from "../../../data/tft/set18/manifest.json";
import traitsJson from "../../../data/tft/set18/traits.json";
import type {
  AugmentData,
  ChampionData,
  EncounterData,
  ItemData,
  TftDataManifest,
  TftDataSnapshot,
  TraitData,
} from "./types";
import { validateDataset } from "./validation";

/**
 * The bundled Set 18 snapshot (`data/tft/set18/`, generated — see the data
 * README for provenance). JSON modules are cast to the schema types; the
 * `validateDataset` call below fails hard at import time if the files and
 * the types ever drift apart, so a broken snapshot is caught in CI/tests
 * before a human notices it.
 */
export const set18Data: TftDataSnapshot = {
  manifest: manifestJson as TftDataManifest,
  champions: championsJson as ChampionData[],
  traits: traitsJson as TraitData[],
  items: itemsJson as ItemData[],
  augments: augmentsJson as AugmentData[],
  encounters: (encountersJson as { encounters: EncounterData[] }).encounters,
};

const problems = validateDataset(set18Data);
if (problems.length > 0) {
  throw new Error(`Set 18 static data failed validation:\n${problems.join("\n")}`);
}
