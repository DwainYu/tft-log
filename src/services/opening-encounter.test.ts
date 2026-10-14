import { beforeEach, describe, expect, it } from "vitest";
import { encounterRepository } from "../data/tft/repositories";
import { encounterIdOrUndefined, validateMatchStaticData } from "../data/tft/match-links";
import { addMatch, updateMatch } from "../services/match-service";
import { matchesToCsv, buildSnapshot, importSnapshot, parseSnapshot } from "../services/export-service";
import { resetDatabase } from "../test/db-helper";

beforeEach(resetDatabase);

const EMBLEM_ENSEMBLE = "SET18_ENC_EMBLEM_ENSEMBLE";
const PRISMATIC_PARTY = "SET18_ENC_PRISMATIC_PARTY";
const NONE = "SET18_ENC_NONE";

describe("Set 18 opening encounter catalog", () => {
  it("ships the official Set 18 table: 20 encounters including No Encounter", () => {
    const encounters = encounterRepository.getEncounters();
    expect(encounters).toHaveLength(20);
    expect(encounters.filter((e) => e.isNone)).toHaveLength(1);
    expect(new Set(encounters.map((e) => e.id)).size).toBe(20);
    expect(encounters.every((e) => e.set === 18)).toBe(true);
  });

  it("covers the two named events and keeps them separate from augments", () => {
    const emblem = encounterRepository.getEncounterById(EMBLEM_ENSEMBLE);
    const party = encounterRepository.getEncounterById(PRISMATIC_PARTY);
    expect(emblem?.englishName).toBe("Emblem Ensemble");
    expect(emblem?.championId).toBe("DA_Lux18_Base");
    expect(party?.englishName).toBe("Prismatic Party");
    expect(party?.championId).toBe("DA_18_ElderDragon");
    // Every championId has to resolve, or the UI would link to a dead unit.
    for (const e of encounterRepository.getEncounters()) {
      if (e.championId) expect(e.championId.length).toBeGreaterThan(0);
    }
  });

  it("has a single unambiguous 'no encounter' outcome", () => {
    const none = encounterRepository.getNoneEncounter();
    expect(none?.id).toBe(NONE);
    expect(none?.isNone).toBe(true);
  });

  it("describes every entry so the selection explains itself", () => {
    for (const e of encounterRepository.getEncounters()) {
      expect(e.description.length).toBeGreaterThan(4);
      expect(e.name.length).toBeGreaterThan(0);
    }
  });
});

describe("Recording an encounter on a match", () => {
  it("saves the picked encounter and reads it back", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: EMBLEM_ENSEMBLE });
    expect(m.encounterId).toBe(EMBLEM_ENSEMBLE);
  });

  it("keeps 'no encounter' distinct from 'not recorded'", async () => {
    const none = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: NONE });
    const blank = await addMatch({ playedAt: "2026-10-14T13:00", placement: "3" });
    expect(none.encounterId).toBe(NONE);
    expect(blank.encounterId).toBeUndefined();
  });

  it("edits back: re-opening a match echoes the stored encounter", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: PRISMATIC_PARTY });
    const updated = await updateMatch(m.id, {
      playedAt: "2026-10-14T12:00",
      placement: "2",
      encounterId: EMBLEM_ENSEMBLE,
    });
    expect(updated.encounterId).toBe(EMBLEM_ENSEMBLE);
    // clearing it goes back to "not recorded", not to "no encounter"
    const cleared = await updateMatch(m.id, { playedAt: "2026-10-14T12:00", placement: "2", encounterId: "" });
    expect(cleared.encounterId).toBeUndefined();
  });

  it("still saves a match when nothing was picked", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "5" });
    expect(m.id).toBeTruthy();
    expect(m.encounterId).toBeUndefined();
  });

  it("drops an id the catalog does not know instead of recording nonsense", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: "MADE_UP" });
    // The form can only ever offer catalog ids, so a stray value means the
    // catalog moved on — recording it would put an unreproducible value into
    // a statistic, so it becomes "not recorded" instead.
    expect(m.encounterId).toBeUndefined();
  });

  it("does not merge it with augments — the two stay separate dimensions", async () => {
    const augmentId = "DA_18_BigGrabBag";
    const m = await addMatch({
      playedAt: "2026-10-14T12:00",
      placement: "2",
      encounterId: EMBLEM_ENSEMBLE,
      augmentIds: [augmentId],
    });
    expect(m.encounterId).toBe(EMBLEM_ENSEMBLE);
    expect(m.augmentIds).toEqual([augmentId]);
  });
});

describe("Encounters through export and import", () => {
  it("survives JSON export -> import without being dropped", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: PRISMATIC_PARTY });
    const snap = await buildSnapshot();
    await resetDatabase();
    await importSnapshot(snap);
    const restored = await buildSnapshot();
    expect(restored.matches.find((x) => x.id === m.id)?.encounterId).toBe(PRISMATIC_PARTY);
  });

  it("keeps the explicit none-election through a round trip", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: NONE });
    const snap = await buildSnapshot();
    await resetDatabase();
    await importSnapshot(snap);
    const restored = await buildSnapshot();
    expect(restored.matches.find((x) => x.id === m.id)?.encounterId).toBe(NONE);
  });

  it("carries encounter_id in the CSV", async () => {
    await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: EMBLEM_ENSEMBLE });
    const csv = matchesToCsv((await buildSnapshot()).matches);
    const header = csv.split("\n")[0];
    expect(header).toContain("encounter_id");
    expect(csv).toContain(EMBLEM_ENSEMBLE);
  });

  it("drops an unknown id from an imported file but keeps the match", async () => {
    const payload = {
      schemaVersion: 2,
      exportedAt: "2026-10-14T12:00:00.000Z",
      app: "tft-training-log",
      matches: [
        {
          id: "old-1",
          playedAt: "2026-10-14T12:00",
          placement: 4,
          reviewed: false,
          encounterId: "SET99_ENC_FROM_THE_FUTURE",
          createdAt: "x",
          updatedAt: "x",
        },
      ],
      decisions: [],
      reviews: [],
      trainingGoals: [],
      trainingSessions: [],
    };
    const snap = parseSnapshot(JSON.stringify(payload));
    const report = await importSnapshot(snap);
    expect(report.matches).toBe(1);
    expect((await buildSnapshot()).matches[0].encounterId).toBeUndefined();
  });

  it("old records without the field are imported untouched", async () => {
    const payload = {
      schemaVersion: 2,
      exportedAt: "2026-10-14T12:00:00.000Z",
      app: "tft-training-log",
      matches: [
        { id: "legacy-1", playedAt: "2026-10-14T12:00", placement: 4, reviewed: false, createdAt: "x", updatedAt: "x" },
      ],
      decisions: [],
      reviews: [],
      trainingGoals: [],
      trainingSessions: [],
    };
    await expect(importSnapshot(parseSnapshot(JSON.stringify(payload)))).resolves.toMatchObject({
      matches: 1,
    });
    expect((await buildSnapshot()).matches[0].encounterId).toBeUndefined();
  });
});

describe("encounterIdOrUndefined", () => {
  it("normalises the three cases", () => {
    expect(encounterIdOrUndefined(EMBLEM_ENSEMBLE)).toBe(EMBLEM_ENSEMBLE);
    expect(encounterIdOrUndefined(NONE)).toBe(NONE);
    expect(encounterIdOrUndefined("NOPE")).toBeUndefined();
    expect(encounterIdOrUndefined(undefined)).toBeUndefined();
    expect(encounterIdOrUndefined("")).toBeUndefined();
  });
});

describe("validateMatchStaticData", () => {
  it("does not take encounters into account (import must not drop a whole match)", () => {
    expect(validateMatchStaticData({})).toEqual([]);
  });
});
